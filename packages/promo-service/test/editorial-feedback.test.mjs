import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ArtifactStore, JsonWorkflowStore, WorkflowService, WorkspaceDeliverables, contentHash, validateEditorialAudit, validateAnnotation, locateAnchor, textFields } from '../dist/index.js';

const finding = { id:'logic',location:'第 2–4 节',layer:'macro',severity:'critical',evidence:'三节重复同一结论，没有新证据支撑产品引入。',action:'合并重复结论，补足问题到体验的关系。',preserve:'保留开头的具体场景。',acceptance:'每节有不同职责且产品引入承接前文问题。',verified:false,verification:'' };
const master={body:'开头\n\n重复结论'}, requirements={audience:'新手'};
function review(){return {passed:true,evidenceBlockers:[],writingStyle:{passed:true},articleEditorial:{passed:true},storyboardDirection:null,audit:{masterHash:contentHash(master),requirementsHash:contentHash(requirements),rationale:'先核对全文关系，再定位局部表达。',findings:[]}};}

test('drafts remain reviewable but contradictory or stale editorial passes fail',()=>{
  assert.doesNotThrow(()=>validateEditorialAudit({...review(),passed:false,audit:undefined},master,requirements));
  assert.throws(()=>validateEditorialAudit({...review(),audit:undefined},master,requirements),/audit/);
  const r=review();r.audit.findings=[finding];
  assert.throws(()=>validateEditorialAudit(r,master,requirements),/contradicts/);
  r.audit.findings=[{...finding,verified:true,verification:'第二节保留问题；第三节给出可见记忆的例子，删去原第四节重复结论。'}];
  assert.doesNotThrow(()=>validateEditorialAudit(r,master,requirements));
  assert.throws(()=>validateEditorialAudit(r,{body:'新版'},requirements),/another/);
  assert.throws(()=>validateEditorialAudit(r,master,{audience:'开发者'}),/another/);
  assert.throws(()=>validateEditorialAudit({...review(),writingStyle:{passed:false}},master,requirements),/contradicts/);
  assert.throws(()=>validateEditorialAudit({...review(),evidenceBlockers:['未核实功能']},master,requirements),/contradicts/);
});

test('free selections preserve Unicode, Markdown, multi-paragraph ranges and exact versions',()=>{
  const text='开头🙂。\n\n## 小节\n重复。下一段。';
  const a={artifactId:'a',kind:'content_master_draft',contentHash:'h',content:{master:{bodyMarkdown:text}}};
  const input={contentHash:'h',body:'压缩这里',anchors:[{field:'/master/bodyMarkdown',start:2,end:15,quote:text.slice(2,15)}]};
  const saved=validateAnnotation(input,a);
  assert.equal(saved.anchors[0].quote,text.slice(2,15));
  assert.deepEqual(locateAnchor(saved.anchors[0],text),{start:2,end:15});
  assert.equal(locateAnchor(saved.anchors[0],'已删除'),null);
  assert.equal(locateAnchor({quote:'重复',prefix:'',suffix:''},'重复。重复。'),null);
  assert.throws(()=>validateAnnotation({...input,contentHash:'other'},a),/stale/);
  assert.throws(()=>validateAnnotation({...input,anchors:[{...input.anchors[0],start:1}]},a),/match/);
  assert.throws(()=>validateAnnotation({...input,expectedAnnotationRevision:0},a,saved),/conflict/);
  assert.deepEqual(textFields({'a/b~':'正文'}),[{field:'/a~1b~0',text:'正文'}]);
  assert.equal(validateAnnotation({...input,anchors:[]},a).anchors.length,0);
});

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'promo-feedback-'));
  const store=new JsonWorkflowStore(join(root,'workflows.json')), artifacts=new ArtifactStore(join(root,'artifacts'));
  const base=await artifacts.write({kind:'requirement_set',content:{schemaVersion:1,carrier:'article',inputUsageIds:['u1','u2'],requirements:[{requirementId:'req-1',sourceAssetId:'s1',materialType:'screenshot',constraints:[],usages:[{usageId:'u1',purpose:'前'},{usageId:'u2',purpose:'后'}],coverageUsageIds:['u1','u2'],reuseCount:2,productionProcedure:'旧步骤🙂\n\n旧结果'}]}});
  await store.write({schemaVersion:1,workflows:{wf:{id:'wf',carrier:'article',rootDirectory:root,state:'REQUIREMENTS_READY',revision:5,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),summary:'fixture',context:{artifactRefs:[base],requirementSetArtifactId:base.artifactId},events:[],idempotency:{}}}});
  const service=new WorkflowService(store,artifacts);
  const input={artifactId:base.artifactId,contentHash:base.contentHash,anchors:[{field:'/requirements/0/productionProcedure',start:0,end:3,quote:'旧步骤'}],body:'步骤需要具体到操作',idempotencyKey:'save-1'};
  return {root,store,artifacts,service,base,input};
}

test('annotations survive reload, deduplicate, retain revisions and do not invalidate a content approval revision',async()=>{
  const {service,store,artifacts,input}=await fixture();
  const first=await service.saveAnnotation('wf',input);
  assert.equal(first.pending.length,1);
  await service.saveAnnotation('wf',input);
  assert.equal((await service.get('wf')).revision,5);
  assert.equal((await service.textReview('wf')).history.annotations.length,1);
  await assert.rejects(service.saveAnnotation('wf',{...input,body:'different'}),/idempotency/);
  await assert.rejects(service.saveAnnotation('wf',{...input,idempotencyKey:'foreign',artifactId:'artifact_foreign'}),/belong/);
  const a=first.pending[0];
  const second=await service.saveAnnotation('wf',{...input,idempotencyKey:'edit',annotationId:a.id,expectedAnnotationRevision:a.revision,body:'不要堆术语，写清动作'});
  assert.equal(second.pending[0].revision,2);
  const reloaded=new WorkflowService(new JsonWorkflowStore(join((await store.read()).workflows.wf.rootDirectory,'workflows.json')),artifacts);
  assert.equal((await reloaded.get('wf')).reviewFeedback.pending[0].body,'不要堆术语，写清动作');
  await assert.rejects(service.commit({workflowId:'wf',expectedRevision:5,kind:'reply_annotations',summary:'old reply',idempotencyKey:'r1',context:{annotationReceipts:[{annotationId:a.id,annotationRevision:1,action:'explained',reply:'旧版回复'}]}}),/changed/);
  assert.equal((await service.textReview('wf')).history.receipts.length,0);
});

test('a material revision and its per-comment action are committed together, while new comments remain pending',async()=>{
  const {service,base,input}=await fixture();
  const a=(await service.saveAnnotation('wf',input)).pending[0];
  await service.saveAnnotation('wf',{...input,idempotencyKey:'save-2',body:'另一处意见'});
  const commit={workflowId:'wf',expectedRevision:5,kind:'submit_requirement_details',summary:'具体操作',idempotencyKey:'change',context:{baseArtifactId:base.artifactId,details:[{requirementId:'req-1',productionProcedure:'准备演示账户。打开记忆页，搜索词条。u1 输出全景；u2 输出详情。验收：两图同一条目；失败时保留缺口。'}],executionReview:{passed:true,evidence:'u1 和 u2 的构图与验收均有具体动作。'},annotationReceipts:[{annotationId:a.id,annotationRevision:a.revision,action:'changed',reply:'补了点击入口、两图要求和验收方式。',verification:'逐项核对 u1/u2 输出要求均存在。'}]}};
  const changed=await service.commit(commit);
  assert.equal(changed.reviewFeedback.pending.length,1);
  assert.equal(changed.reviewFeedback.items.find(x=>x.id===a.id).status,'verified');
  assert.equal(changed.artifactRefs.length,2);
  await service.commit(commit);
  assert.equal((await service.textReview('wf')).history.receipts.length,1);
  assert.equal((await service.textReview('wf')).artifacts.length,2);
  const b=changed.reviewFeedback.pending[0];
  await assert.rejects(service.commit({workflowId:'wf',expectedRevision:6,kind:'reply_annotations',summary:'fake change',idempotencyKey:'bad',context:{annotationReceipts:[{annotationId:b.id,annotationRevision:1,action:'changed',reply:'改好了'}]}}),/new text artifact/);
  const replied=await service.commit({workflowId:'wf',expectedRevision:6,kind:'reply_annotations',summary:'需要选择',idempotencyKey:'question',context:{annotationReceipts:[{annotationId:b.id,annotationRevision:1,action:'needs_input',reply:'这条意见与保留核心演示的要求冲突，需要确认删哪张图。'}]}});
  assert.equal(replied.reviewFeedback.needsInput.length,1);
  assert.equal(replied.revision,6);
});

test('concurrent writers preserve all feedback; withdrawing cannot be closed by an old receipt',async()=>{
  const {service,store,artifacts,input}=await fixture();
  const another=new WorkflowService(new JsonWorkflowStore(join((await store.read()).workflows.wf.rootDirectory,'workflows.json')),artifacts);
  await Promise.all(Array.from({length:6},(_,i)=>(i%2?another:service).saveAnnotation('wf',{...input,idempotencyKey:'parallel-'+i,body:'意见 '+i})));
  const feedback=(await service.get('wf')).reviewFeedback;
  assert.equal(feedback.pending.length,6);
  const a=feedback.pending[0];
  await service.saveAnnotation('wf',{...input,idempotencyKey:'withdraw',annotationId:a.id,expectedAnnotationRevision:1,withdrawn:true});
  await assert.rejects(service.commit({workflowId:'wf',expectedRevision:5,kind:'reply_annotations',summary:'reply withdrawn',idempotencyKey:'withdrawn-reply',context:{annotationReceipts:[{annotationId:a.id,annotationRevision:1,action:'explained',reply:'解释'}]}}),/withdrawn/);
  assert.equal((await service.get('wf')).reviewFeedback.pending.length,5);
});

test('a projection failure retains the durable mutation and retries without duplicate artifacts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'promo-projection-retry-'));
  const store=new JsonWorkflowStore(join(root,'workflows.json')),artifacts=new ArtifactStore(join(root,'artifacts'));
  const workspace=new WorkspaceDeliverables(join(root,'workspace'),artifacts),original=workspace.sync.bind(workspace);
  workspace.sync=async()=>{throw new Error('fixture projection unavailable');};
  const service=new WorkflowService(store,artifacts,undefined,undefined,undefined,workspace);
  const created=await service.create({carrier:'article',rootDirectory:root,summary:'projection fixture',context:{},idempotencyKey:'projection-create'});
  assert.match(created.projectionPending,/已保存/);
  assert.ok((await store.read()).workflows[created.workflowId]);
  workspace.sync=original;
  const repaired=await service.get(created.workflowId);
  assert.equal(repaired.projectionPending,undefined);
  assert.equal(repaired.revision,created.revision);
  assert.equal(Object.keys((await store.read()).workflows).length,1);
});

test('locked material feedback reuses the return path and preserves the prior requirement version',async()=>{
  const {service,store,base,input}=await fixture();
  const data=await store.read();data.workflows.wf.state='PRODUCING';await store.write(data);
  const a=(await service.saveAnnotation('wf',input)).pending[0];
  assert.equal((await service.get('wf')).state,'PRODUCING');
  const returned=await service.commit({workflowId:'wf',expectedRevision:5,kind:'request_text_revision',summary:'按文字批注回到素材细化',idempotencyKey:'return',context:{annotations:[{id:a.id,revision:a.revision}],revisionReason:'用户要求把步骤具体到操作；不修改主稿或使用位。'}});
  assert.equal(returned.state,'REQUIREMENTS_READY');
  assert.equal(returned.pendingAction.id,'submit_requirement_details');
  assert.equal(returned.agentWork.inputs.baseArtifactId,base.artifactId);
  assert.equal(returned.reviewFeedback.pending.length,1);
  assert.equal((await service.textReview('wf')).artifacts.length,1);
  assert.equal(returned.artifactRefs.filter(a=>a.kind==='decision_ledger').length,1);
});
