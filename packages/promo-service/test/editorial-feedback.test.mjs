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

test('text review exposes only the editorial text of every annotatable deliverable',async()=>{
  const root=await mkdtemp(join(tmpdir(),'promo-text-fields-'));
  const store=new JsonWorkflowStore(join(root,'workflows.json')), artifacts=new ArtifactStore(join(root,'artifacts'));
  const master=await artifacts.write({kind:'content_master_draft',content:{
    master:{title:'真正的标题',bodyMarkdown:'真正的正文',primaryCallToAction:'不该出现的独立 CTA',alternativeTitles:['不该出现的备选标题'],assetPlan:{sourceAssets:[{id:'asset-1',purpose:'不该出现的素材计划'}]}},
    review:{audit:{rationale:'不该出现的审计理由'}},warnings:['不该出现的警告'],pendingQuestion:{prompt:'不该出现的追问'},
  }});
  const baseline=await artifacts.write({kind:'baseline',content:{coreMessage:'核心主张',guidanceIntent:'引导意图',campaignIntent:{audienceMoment:'读者场景',immediateBenefit:'即时收益',longTermBenefit:'长期收益',beliefToChange:'改变认知',proofToShow:'证明内容',evidenceBoundary:'事实边界',narratorPosition:'叙述位置',promotionalTemperature:'宣传温度',primaryCallToAction:'行动引导',avoid:['避免套话']},articleEditorialIntent:{readerDecision:'读者决定',humanCenter:'人的处境',authorStance:'作者立场',warmThread:'温度线',emotionalArc:'情绪变化',evidencePosture:'证据姿态'},topicId:'topic-1',confirmedAt:'2026-01-01'}});
  const outline=await artifacts.write({kind:'creative_outline',content:{
    creativeSpine:{routeId:'route-1',creativePremise:'创意前提',storyEngine:'叙事引擎',narrativeAnchor:'叙事锚点',openingMove:'开场动作',progression:'推进方式',proofPlan:'证明计划',endingMove:'结尾动作',macroStyle:{speakerPosition:'不该出现的风格元数据'}},
    outline:{carrier:'article',openingDirection:'开场方向',sections:[{id:'section-1',sectionPurpose:'段落职责',sceneOrAction:'具体场景',content:'段落内容',readerShift:'读者变化',evidence:['证据说明'],authorJudgment:'作者判断',avoid:'避免事项',transition:'过渡',visualAsset:'配图说明'}],titleDirections:['标题方向'],unsupportedClaims:['不可证实主张'],ending:'结尾',primaryCallToAction:'行动引导'},
    macroStyleReview:{skill:'geek-product-promo-writing',scope:'macro',passed:true,findings:['不该出现的审核结论']},confirmedAt:'2026-01-01',
  }});
  const requirements=await artifacts.write({kind:'requirement_set',content:{requirements:[{requirementId:'req-1',productionProcedure:'制作流程',usages:[{usageId:'usage-1',purpose:'使用用途'}],constraints:['拍摄约束'],captureProtocol:{continuousPath:'操作路径',requiredVisibleStates:['可见状态'],editingHandles:'剪辑把手',backupStrategy:'备选方案'}}],derivedFrom:{contentMasterArtifactId:'meta-id'}}});
  const release=await artifacts.write({kind:'release_package_draft',content:{draft:{titleCandidates:[{id:'title-1',title:'发布标题',sourceArtifactIds:['meta-id']}],coverCandidates:[{id:'cover-1',artifactId:'meta-id',brief:'封面说明',sourceArtifactIds:['meta-id']}],summaryDraft:{text:'发布摘要',sourceArtifactIds:['meta-id']}},warnings:['不该出现的警告']}});
  const outlineScript=await artifacts.write({kind:'outline_script',content:{hookAndFirstFrame:'视频开场',beats:[{id:'beat-1',segmentPurpose:'段落职责',speaker:'讲述者',speakerAction:'动作',spokenFunction:'口播功能',presentation:'呈现方式',visualFunction:'画面作用',evidence:['证据'],transition:'转场'}],proofBoundary:['不能证明的事'],ending:'视频结尾',primaryCallToAction:'视频行动',acceptance:['验收要求']}});
  const spoken=await artifacts.write({kind:'spoken_script',content:{lines:[{id:'line-1',text:'口播台词',recordingDirection:'不该出现的录制元数据'}],fixedOnScreenText:[{shotId:'shot-1',text:'屏幕文字'}],acceptance:['不该出现的验收']}});
  const recording=await artifacts.write({kind:'recording_execution',content:{defaultRules:['录制规则'],tasks:[{id:'task-1',sourceLineId:'line-1',script:'录制台词',direction:'录制指导',setup:{composition:'构图',cameraBehavior:'运镜',visualCoverage:'画面覆盖'},fileStem:'不该出现的文件名'}],acceptance:['录制验收']}});
  await store.write({schemaVersion:1,workflows:{wf:{id:'wf',carrier:'article',rootDirectory:root,state:'REQUIREMENTS_READY',revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),summary:'fixture',context:{artifactRefs:[master,baseline,outline,requirements,release,outlineScript,spoken,recording]},events:[],idempotency:{}}}});
  const review=await new WorkflowService(store,artifacts).textReview('wf');
  const fields=Object.fromEntries(review.artifacts.map(a=>[a.kind,a.fields.map(f=>f.field)]));
  assert.deepEqual(fields.baseline,['/coreMessage','/guidanceIntent','/campaignIntent/audienceMoment','/campaignIntent/immediateBenefit','/campaignIntent/longTermBenefit','/campaignIntent/beliefToChange','/campaignIntent/proofToShow','/campaignIntent/evidenceBoundary','/campaignIntent/narratorPosition','/campaignIntent/promotionalTemperature','/campaignIntent/primaryCallToAction','/campaignIntent/avoid/0','/articleEditorialIntent/readerDecision','/articleEditorialIntent/humanCenter','/articleEditorialIntent/authorStance','/articleEditorialIntent/warmThread','/articleEditorialIntent/emotionalArc','/articleEditorialIntent/evidencePosture']);
  assert.deepEqual(fields.content_master_draft,['/master/title','/master/bodyMarkdown']);
  assert.deepEqual(fields.creative_outline,[
    '/creativeSpine/creativePremise','/creativeSpine/storyEngine','/creativeSpine/narrativeAnchor','/creativeSpine/openingMove','/creativeSpine/progression','/creativeSpine/proofPlan','/creativeSpine/endingMove',
    '/outline/openingDirection','/outline/sections/0/sectionPurpose','/outline/sections/0/sceneOrAction','/outline/sections/0/content','/outline/sections/0/readerShift','/outline/sections/0/evidence/0','/outline/sections/0/authorJudgment','/outline/sections/0/avoid','/outline/sections/0/transition','/outline/sections/0/visualAsset','/outline/titleDirections/0','/outline/unsupportedClaims/0','/outline/ending','/outline/primaryCallToAction',
  ]);
  assert.deepEqual(fields.requirement_set,['/requirements/0/productionProcedure','/requirements/0/usages/0/purpose','/requirements/0/constraints/0','/requirements/0/captureProtocol/continuousPath','/requirements/0/captureProtocol/requiredVisibleStates/0','/requirements/0/captureProtocol/editingHandles','/requirements/0/captureProtocol/backupStrategy']);
  assert.deepEqual(fields.release_package_draft,['/draft/titleCandidates/0/title','/draft/coverCandidates/0/brief','/draft/summaryDraft/text']);
  assert.deepEqual(fields.outline_script,['/hookAndFirstFrame','/beats/0/segmentPurpose','/beats/0/speaker','/beats/0/speakerAction','/beats/0/spokenFunction','/beats/0/presentation','/beats/0/visualFunction','/beats/0/evidence/0','/beats/0/transition','/proofBoundary/0','/ending','/primaryCallToAction','/acceptance/0']);
  assert.deepEqual(fields.spoken_script,['/lines/0/text','/fixedOnScreenText/0/text']);
  assert.deepEqual(fields.recording_execution,['/defaultRules/0','/tasks/0/script','/tasks/0/direction','/tasks/0/setup/composition','/tasks/0/setup/cameraBehavior','/tasks/0/setup/visualCoverage','/acceptance/0']);
  await assert.rejects(new WorkflowService(store,artifacts).saveAnnotation('wf',{artifactId:master.artifactId,contentHash:master.contentHash,anchors:[{field:'/master/alternativeTitles/0',start:0,end:2,quote:'不该'}],body:'这不该可批注',idempotencyKey:'reject-meta'}),/Selection does not match/);
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
  assert.equal(changed.reviewFeedback.items.find(x=>x.id===a.id).status,'changed');
  assert.equal(changed.reviewFeedback.awaitingVerification.length,1);
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
