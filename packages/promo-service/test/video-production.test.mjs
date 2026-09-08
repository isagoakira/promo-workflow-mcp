import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVideoProduction, changeVideoProduction, VIDEO_PRODUCTION_PHASES, WorkflowService, JsonWorkflowStore, ArtifactStore } from '../dist/index.js';
const env = { actor: 'human', planArtifactId: 'plan1', currentPreviewId: 'v1', unresolvedFeedback: false };
const change = (state, input, extra={}) => changeVideoProduction(state, { reason: 'test evidence', ...input }, { ...env, ...extra });
const submit = state => change(change(state, { action:'task', title:'检查本阶段', status:'done', artifactIds:['evidence'] }), { action:'submit', artifactIds:['evidence'], previewId:'v1' });
test('six phases require exact human approval and preserve multi-task rework history', () => {
  let state=createVideoProduction('plan1');
  assert.throws(()=>change(state,{action:'approve'}),/exact/);
  state=change(state,{action:'task',taskId:'t1',title:'补录',status:'blocked',owner:'user'});
  assert.equal(state.status,'waiting_material');
  assert.throws(()=>submit(state),/Complete every/);
  state=change(state,{action:'task',taskId:'t1',status:'done',artifactIds:['recording']});
  state=submit(state);
  assert.throws(()=>change(state,{action:'task',title:'偷偷修改审片轮次'}),/Rework the submitted/);
  assert.throws(()=>change(state,{action:'approve',submissionId:state.submission.id},{actor:'agent'}),/Human/);
  assert.throws(()=>change(state,{action:'approve',submissionId:'old'}),/exact/);
  state=change(state,{action:'approve',submissionId:state.submission.id});
  assert.equal(state.phase,'rough_cut');
  state=submit(state);
  assert.throws(()=>change(state,{action:'approve',submissionId:state.submission.id},{currentPreviewId:'v2'}),/stale/);
  assert.throws(()=>change(state,{action:'approve',submissionId:state.submission.id},{unresolvedFeedback:true}),/Unresolved/);
  state=change(state,{action:'rework',phase:'rough_cut'});
  assert.equal(state.round,2); assert.equal(state.approvals.length,1); assert.equal(state.submission,null);
  assert.ok(state.history.some(h=>h.snapshot.submission));
  assert.throws(()=>change(state,{action:'rework',phase:'delivery'}),/skip/);
});
test('planning pause preserves scene and impact resume invalidates only affected phases', () => {
  let state=createVideoProduction('plan1');
  for(let i=0;i<3;i++){state=submit(state);state=change(state,{action:'approve',submissionId:state.submission.id});}
  state=change(state,{action:'return_planning',node:4});
  assert.equal(state.phase,'fine_cut'); assert.equal(state.status,'paused_planning');
  assert.throws(()=>submit(state),/paused/);
  state=change(state,{action:'resume',phase:'audio'},{planArtifactId:'plan2'});
  assert.equal(state.planArtifactId,'plan2');assert.equal(state.phase,'audio');assert.equal(state.approvals.length,2);
  assert.equal(state.planningReturn,null);assert.ok(state.tasks.filter(t=>t.phase==='audio').every(t=>t.status==='todo'));
});
test('service persists rounds, rejects cross-workflow evidence, and requires restored main state before resume', async () => {
  const root=await mkdtemp(join(tmpdir(),'production-state-'));
  try {
    const store=new JsonWorkflowStore(join(root,'workflows.json')), artifacts=new ArtifactStore(join(root,'artifacts'));
    const plan=await artifacts.write({kind:'requirement_set',content:{requirements:[]},parentArtifactIds:[],revision:1});
    await store.write({schemaVersion:1,workflows:{wf:{id:'wf',carrier:'video',state:'PRODUCING',revision:1,createdAt:'now',updatedAt:'now',summary:'test',context:{requirementSetArtifactId:plan.artifactId,artifactRefs:[plan]},events:[],idempotency:{}}}});
    const service=new WorkflowService(store,artifacts);
    const start={workflowId:'wf',expectedRevision:1,idempotencyKey:'start',action:'start',reason:'begin'};
    const first=await service.updateVideoProduction(start);assert.equal(first.revision,2);
    assert.equal((await service.updateVideoProduction(start)).revision,2);
    await assert.rejects(service.updateVideoProduction({...start,reason:'different'}),/idempotency/);
    await assert.rejects(service.updateVideoProduction({...start,idempotencyKey:'task',action:'task',title:'check',expectedRevision:2,status:'done',artifactIds:['foreign']}),/belong/);
    const paused=await service.updateVideoProduction({...start,expectedRevision:2,idempotencyKey:'return',action:'return_planning',node:5,reason:'素材不足'},'human');
    assert.equal(paused.workflowState,'REQUIREMENTS_READY');assert.equal(paused.production.status,'paused_planning');
    await assert.rejects(service.updateVideoProduction({...start,expectedRevision:3,idempotencyKey:'resume',action:'resume',phase:'materials'},'human'),/node 6/);
    const restored=await new WorkflowService(store,artifacts).videoProduction('wf');assert.equal(restored.production.status,'paused_planning');
  } finally {await rm(root,{recursive:true,force:true});}
});
