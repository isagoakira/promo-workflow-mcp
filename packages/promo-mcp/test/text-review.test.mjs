import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { get } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArtifactStore, JsonWorkflowStore } from '@promo-workflow/service';
import { createReviewHost } from '../dist/review-host.js';
import { TEXT_REVIEW_JS } from '../dist/text-review-client.js';

test('text desk JavaScript parses independently of the host template',()=>{assert.doesNotThrow(()=>new Script(TEXT_REVIEW_JS));});

test('text annotation HTTP path persists exact selections and rejects cross-site writes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'promo-text-http-'));
  const artifacts=new ArtifactStore(join(root,'artifacts')),store=new JsonWorkflowStore(join(root,'workflows.json'));
  const a=await artifacts.write({kind:'content_master_draft',content:{master:{bodyMarkdown:'第一段🙂\n\n第二段正文'}}});
  await store.write({schemaVersion:1,workflows:{wf:{id:'wf',carrier:'article',state:'ALIGNING_MASTER',revision:2,context:{artifactRefs:[a]},events:[],idempotency:{},createdAt:'now',updatedAt:'now',summary:'test'}}});
  const server=createReviewHost({dataDirectory:root});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  try {
    const token=(await (await fetch(origin+'/api/text-session')).json()).token;
    const rebound=await new Promise((resolve,reject)=>{get(origin+'/api/text-session',{headers:{host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});
    assert.equal(rebound,403);
    const endpoint=origin+'/api/workflows/wf/annotations';
    const payload={artifactId:a.artifactId,contentHash:a.contentHash,anchors:[{field:'/master/bodyMarkdown',start:0,end:3,quote:'第一段'}],body:'<img src=x onerror=alert(1)> 太长',idempotencyKey:'http-save'};
    const write=(body,headers={})=>fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
    assert.equal((await write(payload)).status,403);
    assert.equal((await write(payload,{origin:'https://evil.example','x-promo-token':token})).status,403);
    const headers={origin,'x-promo-token':token};
    const good=await write(payload,headers);assert.equal(good.status,200);
    assert.equal((await good.json()).pending[0].body,payload.body);
    await write(payload,headers);
    const view=await (await fetch(origin+'/api/workflows/wf/text')).json();
    assert.equal(view.history.annotations.length,1);
    assert.equal(view.artifacts[0].fields[0].text,'第一段🙂\n\n第二段正文');
    assert.equal((await write({...payload,idempotencyKey:'foreign',artifactId:'artifact_elsewhere'},headers)).status,500);
    assert.equal((await write({...payload,idempotencyKey:'large',body:'x'.repeat(110000)},headers)).status,413);
  } finally {await new Promise(r=>server.close(r));}
});
