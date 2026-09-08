import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { get } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonWorkflowStore } from '@promo-workflow/service';
import { createReviewHost } from '../dist/review-host.js';
import { VIDEO_REVIEW_JS } from '../dist/video-review-client.js';

test('video desk script parses',()=>assert.doesNotThrow(()=>new Script(VIDEO_REVIEW_JS)));
test('registered media supports byte ranges and video feedback requires an authenticated same-origin session',async()=>{
  const root=await mkdtemp(join(tmpdir(),'promo-video-http-')), bytes=Buffer.from('0123456789-video-preview'),path=join(root,'clip.mp4');await writeFile(path,bytes);
  const sha256=createHash('sha256').update(bytes).digest('hex'),store=new JsonWorkflowStore(join(root,'workflows.json'));
  await store.write({schemaVersion:1,workflows:{wf:{id:'wf',carrier:'video',state:'IN_PRODUCTION',revision:2,context:{artifactRefs:[]},events:[],idempotency:{},createdAt:'now',updatedAt:'now',summary:'test',videoReview:{previews:[{previewId:'pv1',artifactId:'a1',locator:path,sha256,durationMs:5000,sourceRevision:1,planVersion:'p1'}],currentPreviewId:'pv1',annotations:[],history:[]}}}});
  const server=createReviewHost({dataDirectory:root});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,base=origin+'/api/workflows/wf/';
  try {
    const token=(await(await fetch(origin+'/api/text-session')).json()).token;
    const media=await fetch(base+'video-media/pv1',{headers:{range:'bytes=2-5'}});assert.equal(media.status,206);assert.equal(media.headers.get('content-range'),'bytes 2-5/'+bytes.length);assert.equal(await media.text(),'2345');
    const suffix=await fetch(base+'video-media/pv1',{headers:{range:'bytes=-7'}});assert.equal(await suffix.text(),'preview');
    assert.equal((await fetch(base+'video-media/pv1',{method:'HEAD'})).headers.get('content-length'),String(bytes.length));
    assert.equal((await fetch(base+'video-media/pv1',{headers:{range:'bytes=300-400'}})).status,416);
    assert.equal((await fetch(base+'video-media/pv1',{headers:{range:'bytes=0-1,3-4'}})).status,416);
    assert.equal((await fetch(base+'video-media/not-registered')).status,404);
    assert.equal((await fetch(base+'video-media/pv1',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
    const rebound=await new Promise((resolve,reject)=>get(base+'video-media/pv1',{headers:{host:'evil.example'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject));assert.equal(rebound,403);
    const payload={action:'create',previewId:'pv1',sha256,selections:[{startMs:100,endMs:100},{startMs:1000,endMs:2000,region:{x:.2,y:.1,width:.3,height:.4}},{startMs:3000,endMs:3500}],text:'放大这些片段 <script>',intent:'production_change',expectedRevision:2,idempotencyKey:'test-1'};
    const save=headers=>fetch(base+'video-annotations',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(payload)});
    assert.equal((await save({})).status,403);assert.equal((await save({origin:'https://evil.example','x-promo-token':token})).status,403);
    const ok=await save({origin,'x-promo-token':token});assert.equal(ok.status,200);const saved=await ok.json();assert.equal(saved.annotations[0].selections.length,3);assert.equal(saved.annotations[0].previewId,'pv1');
    assert.equal((await save({origin,'x-promo-token':token})).status,200);
    const restored=await(await fetch(base+'video-review')).json();assert.equal(restored.annotations.length,1);assert.equal(restored.revision,3);
    await writeFile(path,Buffer.from('changed-preview'));assert.equal((await fetch(base+'video-media/pv1')).status,409);
  } finally {await new Promise(r=>server.close(r));}
});
