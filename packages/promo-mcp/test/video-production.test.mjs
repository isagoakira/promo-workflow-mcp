import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonWorkflowStore } from '@promo-workflow/service';
import { createReviewHost } from '../dist/review-host.js';
import { VIDEO_PRODUCTION_JS } from '../dist/video-production-client.js';
test('production panel script parses',()=>assert.doesNotThrow(()=>new Script(VIDEO_PRODUCTION_JS)));
test('production read/write endpoints require local human session and preserve rounds',async()=>{
  const root=await mkdtemp(join(tmpdir(),'production-http-')),store=new JsonWorkflowStore(join(root,'workflows.json'));
  await store.write({schemaVersion:1,workflows:{wf:{id:'wf',carrier:'video',state:'PRODUCING',revision:1,context:{requirementSetArtifactId:'plan'},events:[],idempotency:{},createdAt:'now',updatedAt:'now',summary:'test'}}});
  const server=createReviewHost({dataDirectory:root});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,path=origin+'/api/workflows/wf/video-production';
  try {
    const token=(await(await fetch(origin+'/api/text-session')).json()).token;
    assert.equal((await(await fetch(path)).json()).production,null);
    const input={action:'start',expectedRevision:1,reason:'test',idempotencyKey:'start'};
    const post=(body,headers={})=>fetch(path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
    assert.equal((await post(input)).status,403);
    const headers={origin,'x-promo-token':token};
    assert.equal((await post(input,headers)).status,200);
    assert.equal((await post(input,headers)).status,200);
    assert.equal((await post({...input,action:'task'},headers)).status,400);
    assert.equal((await(await fetch(path)).json()).production.phase,'materials');
  }finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true});}
});
