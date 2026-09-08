// Run with PROMO_PLAYWRIGHT_MODULE pointing to the installed Playwright entrypoint.
import assert from 'node:assert/strict';
import { mkdtemp,readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ArtifactStore,JsonWorkflowStore,WorkspaceDeliverables,WorkflowService } from '@promo-workflow/service';
import { createReviewHost } from '../dist/review-host.js';

const {chromium}=await import(pathToFileURL(resolve(process.env.PROMO_PLAYWRIGHT_MODULE)));
const root=await mkdtemp(join(tmpdir(),'promo-video-browser-')),clip=join(root,'review-v1.mp4'),clip2=join(root,'review-v2.mp4');
for(const [path,color] of [[clip,'0x24587d'],[clip2,'0x49754b']])execFileSync(process.env.FFMPEG_BIN||'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c='+color+':s=640x360:r=24:d=8','-f','lavfi','-i','sine=frequency=440:sample_rate=44100:duration=8','-vf','drawbox=x=80+20*t:y=80:w=200:h=100:color=yellow:t=fill','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-shortest',path]);
const preview=async(path,id)=>({previewId:id,artifactId:'artifact_'+id,sha256:createHash('sha256').update(await readFile(path)).digest('hex'),locator:path,durationMs:8000,sourceRevision:1,planVersion:'plan-1'});
const p1=await preview(clip,'preview-v1'),p2=await preview(clip2,'preview-v2');
const artifacts=new ArtifactStore(join(root,'artifacts')),store=new JsonWorkflowStore(join(root,'workflows.json')),workspace=new WorkspaceDeliverables(join(root,'workspace'),artifacts);
await workspace.sync({workflowId:'wf-video',carrier:'video',displayName:'视频时空批注验收',rootDirectory:root,state:'IN_PRODUCTION',revision:2,summary:'真实视频浏览器测试',artifactRefs:[],workspaceScope:workspace.scopeFor('wf-video','video')});
await store.write({schemaVersion:1,workflows:{'wf-video':{id:'wf-video',carrier:'video',rootDirectory:root,displayName:'视频时空批注验收',state:'IN_PRODUCTION',revision:2,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),summary:'真实视频浏览器测试',context:{artifactRefs:[]},events:[],idempotency:{},videoReview:{previews:[p1],currentPreviewId:p1.previewId,annotations:[],history:[]}}}});
const service=new WorkflowService(store,artifacts),server=createReviewHost({dataDirectory:root});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(origin+'/?workflowId=wf-video');await page.getByRole('button',{name:'视频审片与批注',exact:true}).click();await page.getByRole('dialog').waitFor();
  await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);assert.equal(await page.locator('video').evaluate(v=>v.videoWidth),640);
  await page.locator('video').evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('video').currentTime>.15);await page.locator('video').evaluate(v=>v.pause());
  const seek=async ms=>{await page.getByLabel('视频时间轴').evaluate((n,value)=>{n.value=String(value);n.dispatchEvent(new Event('input',{bubbles:true}));},ms);await page.waitForFunction(value=>Math.abs(document.querySelector('video').currentTime*1000-value)<30,ms);};
  await seek(500);
  await page.getByLabel('视频时间轴').focus();await page.keyboard.press('Space');await page.waitForFunction(()=>!document.querySelector('video').paused);
  await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('video').paused);
  await seek(500);await page.getByRole('button',{name:'添加当前时间点',exact:true}).click();
  await seek(1000);await page.getByRole('button',{name:'标记开始',exact:true}).click();await seek(2500);await page.getByRole('button',{name:'标记结束并添加',exact:true}).click();
  await page.getByRole('button',{name:'框选画面',exact:true}).click();const box=await page.locator('.video-overlay').boundingBox();await page.mouse.move(box.x+box.width*.2,box.y+box.height*.2);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.6,{steps:6});await page.mouse.up();
  await seek(4500);await page.getByRole('button',{name:'标记开始',exact:true}).click();await seek(6000);await page.getByRole('button',{name:'标记结束并添加',exact:true}).click();assert.equal(await page.locator('.video-selection').count(),3);
  await page.getByLabel('视频批注意见').fill('这两段放大结果；保留第一个时间点。<img src=x>');await page.evaluate(()=>window.dispatchEvent(new Event('promo-text-update')));assert.equal(await page.locator('.video-selection').count(),3);
  await page.screenshot({path:join(root,'video-review-selection.png')});
  await page.getByRole('button',{name:'保存视频批注',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.video-status').textContent.includes('已保存'));
  let view=await service.videoReview('wf-video'),note=view.annotations[0];assert.equal(note.selections.length,3);assert.deepEqual(note.selections[0],{startMs:500,endMs:500});assert.equal(note.selections[1].startMs,1000);assert.equal(note.selections[1].endMs,2500);assert.ok(Math.abs(note.selections[1].region.width-.4)<.01);assert.equal(await page.locator('.video-note img').count(),0);
  await page.screenshot({path:join(root,'video-review-multirange.png'),fullPage:true});
  await page.reload();await page.getByRole('button',{name:'视频审片与批注',exact:true}).click();await page.locator('.video-note').waitFor();await page.getByRole('button',{name:/回看选区 2/}).click();await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-1)<.03);assert.equal(await page.locator('.video-region').count(),1);
  await page.getByLabel('视频时间轴').focus();await page.keyboard.press('Space');
  await page.waitForFunction(()=>document.querySelector('video').paused&&Math.abs(document.querySelector('video').currentTime-2.5)<.03);
  await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('video').currentTime>2.7);
  await page.keyboard.press('Space');assert.equal(await page.locator('video').evaluate(v=>v.paused),true);
  // A new preview arrives after feedback. Original anchors stay bound to v1.
  const data=await store.read();data.workflows['wf-video'].videoReview.previews.push(p2);data.workflows['wf-video'].videoReview.currentPreviewId=p2.previewId;data.workflows['wf-video'].revision++;await store.write(data);
  view=await service.videoReview('wf-video');await service.videoAnnotate({workflowId:'wf-video',expectedRevision:view.revision,action:'address',annotationId:note.id,expectedAnnotationRevision:note.revision,targetPreviewId:p2.previewId,reply:'放大已完成，新版 00:01—00:02.5。请人工检查。',idempotencyKey:'browser-address'});
  await page.getByRole('button',{name:'检查更新',exact:true}).click();
  await page.getByRole('button',{name:'双视频对照',exact:true}).click();await page.waitForFunction(()=>[...document.querySelectorAll('.video-compare-side video')].every(v=>v.readyState>=2));
  assert.equal(await page.locator('.video-compare-side video').count(),2);const leftBox=await page.getByLabel('修改前视频').boundingBox(),rightBox=await page.getByLabel('修改后视频').boundingBox();assert.ok(rightBox.x>leftBox.x+leftBox.width);assert.equal(leftBox.y,rightBox.y);
  await page.getByRole('button',{name:'原批注选区 2',exact:true}).click();await page.waitForFunction(()=>Math.abs(document.querySelector('[aria-label="修改前视频"]').currentTime-1)<.03);assert.equal(await page.getByLabel('修改后视频').evaluate(v=>v.currentTime),0);assert.equal(await page.locator('.video-compare-frame .video-region:visible').count(),1);
  await page.getByLabel('修改后时间轴').evaluate(n=>{n.value='3000';n.dispatchEvent(new Event('input',{bubbles:true}));});await page.waitForFunction(()=>Math.abs(document.querySelector('[aria-label="修改后视频"]').currentTime-3)<.03);assert.equal(await page.getByLabel('修改前视频').evaluate(v=>v.currentTime),1);
  await page.getByRole('button',{name:'从各自当前位置联动播放',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="修改前视频"]').currentTime>1.3);const times=await page.locator('.video-compare-side video').evaluateAll(v=>v.map(p=>p.currentTime));assert.ok(Math.abs(times[1]-times[0]-2)<.2);await page.getByRole('button',{name:'暂停并取消联动',exact:true}).click();
  await page.screenshot({path:join(root,'video-review-comparison.png')});await page.getByRole('button',{name:'返回批注与确认',exact:true}).click();
  await page.getByRole('button',{name:'查看修改版',exact:true}).click();assert.equal(await page.getByLabel('视频版本').inputValue(),p2.previewId);
  await page.getByRole('button',{name:/回看选区 2/}).click();assert.equal(await page.getByLabel('视频版本').inputValue(),p1.previewId);await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-1)<.03);
  await page.getByRole('button',{name:'查看修改版',exact:true}).click();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'确认已解决',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.video-status').textContent.includes('已记录人工确认'));assert.equal((await service.videoReview('wf-video')).annotations[0].status,'resolved');
  await seek(7000);await page.getByRole('button',{name:'添加当前时间点',exact:true}).click();await page.getByLabel('意见类型').selectOption('planning_change');await page.getByLabel('视频批注意见').fill('这里改为解释适用场景。');await page.route('**/video-annotations',route=>route.abort(),{times:1});await page.getByRole('button',{name:'保存视频批注',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.video-status').textContent.includes('未保存'));assert.equal(await page.getByLabel('视频批注意见').inputValue(),'这里改为解释适用场景。');await page.getByRole('button',{name:'保存视频批注',exact:true}).click();await page.waitForFunction(()=>document.querySelector('textarea').value==='');assert.equal((await service.videoReview('wf-video')).annotations[1].intent,'planning_change');
  await page.screenshot({path:join(root,'video-review-verified.png'),fullPage:true});assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,root,checks:['actual video decoding and playback','point plus multiple ranges','normalized box selection','durable reload','original version seek','two videos visible side by side','independent comparison seek','explicit linked playback preserves offset','human resolve','planning feedback','draft survives network failure'],screenshots:[join(root,'video-review-selection.png'),join(root,'video-review-comparison.png'),join(root,'video-review-verified.png')]}));
}catch(error){console.error(JSON.stringify({root,status:await page.locator('.video-status').textContent(),errors}));await page.screenshot({path:join(root,'video-review-failed.png')});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
