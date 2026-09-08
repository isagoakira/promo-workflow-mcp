import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { ArtifactStore, JsonWorkflowStore, WorkflowService, WorkspaceDeliverables } from '@promo-workflow/service';

test('MCP registers another workspace, lists it after restart and routes an explicit commit to its original store', async t => {
  const temp=await mkdtemp(join(tmpdir(),'promo-registry-mcp-'));
  t.after(()=>rm(temp,{recursive:true,force:true}));
  const roots=[join(temp,'one'),join(temp,'two')];
  const services=[]; const flows=[];
  for (const root of roots) {
    await mkdir(root); const data=join(root,'data'); const artifacts=new ArtifactStore(join(data,'artifacts'));
    const service=new WorkflowService(new JsonWorkflowStore(join(data,'workflows.json')),artifacts,undefined,undefined,undefined,new WorkspaceDeliverables(join(data,'workspace'),artifacts));
    services.push(service); flows.push(await service.create({carrier:'video',rootDirectory:root,displayName:'工程 '+services.length,summary:'test',context:{},idempotencyKey:'create'}));
  }
  const start=async()=>{
    const child=spawn(process.execPath,['dist/index.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PROMO_WORKFLOW_DATA_DIR:join(roots[0],'data'),PROMO_PROJECT_REGISTRY:join(temp,'projects.json'),PROMO_REVIEW_AUTO_START:'false'},stdio:['pipe','pipe','pipe']});
    t.after(()=>child.kill());
    const waiting=new Map(); let id=0; let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
    const lines=createInterface({input:child.stdout});
    lines.on('line',line=>{const msg=JSON.parse(line);if(waiting.has(msg.id)){waiting.get(msg.id)(msg);waiting.delete(msg.id);}});
    const call=(method,params)=>new Promise((resolve,reject)=>{const number=++id;const timer=setTimeout(()=>{waiting.delete(number);reject(new Error('MCP timeout '+errors));},10000);waiting.set(number,msg=>{clearTimeout(timer);msg.error?reject(new Error(JSON.stringify(msg.error))):resolve(msg.result);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:number,method,params})+'\n');});
    await call('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'registry-test',version:'1'}});
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
    return {child,tool:async(name,args={})=>{const result=await call('tools/call',{name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return result.structuredContent??JSON.parse(result.content[0].text);}};
  };
  const first=await start();
  await first.tool('promo_register_project',{rootDirectory:roots[1]});
  assert.equal((await first.tool('promo_projects')).projects.length,2);
  assert.equal((await first.tool('promo_get')).workflows.length,2);
  first.child.kill();
  const second=await start();
  assert.equal((await second.tool('promo_projects')).projects.length,2);
  const current=await second.tool('promo_get',{workflowId:flows[1].workflowId});
  assert.equal(current.workflowId,flows[1].workflowId);
  const reused=await second.tool('promo_commit',{kind:'create_workflow',carrier:'video',rootDirectory:await realpath(roots[1]),summary:'reuse registered workspace',context:{},idempotencyKey:'reuse-alias'});
  assert.equal(reused.workflowId,current.workflowId);
  const result=await second.tool('promo_commit',{kind:'confirm_workspace',workflowId:current.workflowId,expectedRevision:current.revision,summary:'仅测试：确认隔离工作区',context:{confirmed:true},idempotencyKey:'cross-store-confirm'});
  assert.equal(result.revision,current.revision+1);
  assert.equal(result.projectionPending,undefined,'canonical path lookup must not break the saved workspace scope');
  assert.equal((await services[1].get(current.workflowId)).revision,result.revision);
  await assert.rejects(services[0].get(current.workflowId));
});
