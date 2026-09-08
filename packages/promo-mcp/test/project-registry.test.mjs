import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rename, rm, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { JsonWorkflowStore } from '@promo-workflow/service';
import { ProjectRegistry } from '../dist/project-registry.js';
import { createReviewHost } from '../dist/review-host.js';
import { PROJECT_REGISTRY_JS } from '../dist/project-registry-client.js';

async function fixture(t) {
  const temp = await mkdtemp(join(tmpdir(), 'promo-project-registry-'));
  t.after(() => rm(temp, {recursive:true,force:true}));
  const a=join(temp,'a'), b=join(temp,'b');
  await mkdir(a); await mkdir(b);
  const dataA=join(a,'data'), dataB=join(b,'data');
  const make=(id,root)=>({id,rootDirectory:root,carrier:'video',state:'PRODUCING',revision:1,displayName:id,summary:'test',createdAt:'now',updatedAt:'now',events:[],idempotency:{},context:{requirementSetArtifactId:'plan',artifactRefs:[]}});
  await new JsonWorkflowStore(join(dataA,'workflows.json')).write({schemaVersion:1,workflows:{a:make('a',a)}});
  await new JsonWorkflowStore(join(dataB,'workflows.json')).write({schemaVersion:1,workflows:{b:make('b',b),sibling:make('sibling',join(temp,'unregistered'))}});
  return {temp,a,b,dataA,dataB,make,registry:new ProjectRegistry(join(temp,'registry.json'),dataA)};
}

test('registration survives restart, canonicalizes workspace paths, and does not expose siblings',async t=>{
  const f=await fixture(t);
  assert.deepEqual(await f.registry.discoverCurrent(),[]);
  await f.registry.register(f.b);
  const alias=join(f.temp,'alias'); await symlink(f.b,alias);
  await f.registry.register(alias);
  const restarted=new ProjectRegistry(f.registry.filePath,f.dataB);
  assert.equal((await restarted.entries()).length,2);
  assert.equal(await f.registry.locate('b'),await realpath(f.dataB));
  await assert.rejects(f.registry.locate('sibling'),/未找到/);
  const before=await readFile(join(f.dataB,'workflows.json'),'utf8');
  assert.equal((await restarted.scan()).projects.length,2);
  assert.equal(await readFile(join(f.dataB,'workflows.json'),'utf8'),before,'scanning must not mutate progress');
  await assert.rejects(f.registry.register('relative'),/绝对路径/);
});

test('offline, missing evidence and duplicate workflow IDs are explicit, never silently merged',async t=>{
  const f=await fixture(t); await f.registry.discoverCurrent(); await f.registry.register(f.b);
  const store=new JsonWorkflowStore(join(f.dataB,'workflows.json')); const data=await store.read();
  data.workflows.b.context.artifactRefs=[{artifactId:'missing'}]; data.workflows.a=f.make('a',f.b); await store.write(data);
  await assert.rejects(f.registry.locate('a'),/多个副本/);
  const scan=await f.registry.scan(); assert.equal(scan.projects.find(p=>p.rootDirectory.endsWith('/b')).status,'attention');
  assert.ok(scan.projects.some(p=>p.issues.some(i=>i.includes('缺失'))));
  await rename(f.b,f.b+'-offline');
  const offline=await f.registry.scan(); assert.equal(offline.projects.find(p=>p.rootDirectory.endsWith('/b')).status,'unavailable');
  assert.equal(offline.projects.find(p=>p.rootDirectory.endsWith('/a')).status,'ready');
});

test('one review host lists, reads and writes the registered original store, not the active store',async t=>{
  const f=await fixture(t); await f.registry.discoverCurrent(); await f.registry.register(f.b);
  const server=createReviewHost({dataDirectory:f.dataA,registry:f.registry});
  await new Promise(r=>server.listen(0,'127.0.0.1',r)); t.after(()=>new Promise(r=>server.close(r)));
  const origin='http://127.0.0.1:'+server.address().port;
  const list=await(await fetch(origin+'/api/workflows')).json();
  assert.deepEqual(list.map(w=>w.workflowId).sort(),['a','b']);
  const catalog=await(await fetch(origin+'/api/projects')).json(); assert.equal(catalog.projects.length,2);
  assert.equal(catalog.projects[0].workflows[0].progress.node,6);
  const reviewed=await(await fetch(origin+'/api/workflows/b')).json();
  assert.equal(reviewed.workflow?.workflowId,'b',JSON.stringify(reviewed));
  const token=(await(await fetch(origin+'/api/text-session')).json()).token;
  const input={action:'start',expectedRevision:1,reason:'test registered project',idempotencyKey:'registered-start'};
  const response=await fetch(origin+'/api/workflows/b/video-production',{method:'POST',headers:{origin,'content-type':'application/json','x-promo-token':token},body:JSON.stringify(input)});
  assert.equal(response.status,200,await response.text());
  assert.equal((await new JsonWorkflowStore(join(f.dataB,'workflows.json')).read()).workflows.b.videoProduction.phase,'materials');
  assert.equal((await new JsonWorkflowStore(join(f.dataA,'workflows.json')).read()).workflows.b,undefined);
  assert.equal((await fetch(origin+'/api/projects',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
});

test('corrupt registry is not overwritten and directory script parses',async t=>{
  const f=await fixture(t); await writeFile(f.registry.filePath,'broken');
  await assert.rejects(f.registry.register(f.a),/无法读取/);
  assert.equal(await readFile(f.registry.filePath,'utf8'),'broken');
  assert.doesNotThrow(()=>new Script(PROJECT_REGISTRY_JS));
});

test('a damaged active store does not prevent startup discovery of other registered projects',async t=>{
  const f=await fixture(t); await f.registry.discoverCurrent(); await f.registry.register(f.b);
  await writeFile(join(f.dataA,'workflows.json'),'broken');
  assert.equal((await f.registry.discoverCurrent()).length,1);
  const scan=await f.registry.scan();
  assert.equal(scan.projects.find(p=>p.rootDirectory.endsWith('/a')).status,'unavailable');
  assert.equal(scan.projects.find(p=>p.rootDirectory.endsWith('/b')).status,'ready');
  assert.equal(await f.registry.locate('b'),await realpath(f.dataB));
});
