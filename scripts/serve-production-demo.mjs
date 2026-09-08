// Isolated UI fixture; creates no video copies or real approvals.
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ArtifactStore, JsonWorkflowStore, WorkspaceDeliverables, WorkflowService } from '../packages/promo-service/dist/index.js';
import { createReviewHost } from '../packages/promo-mcp/dist/review-host.js';
const root=await mkdtemp(join(tmpdir(),'promo-production-demo-')), artifacts=new ArtifactStore(join(root,'artifacts')),store=new JsonWorkflowStore(join(root,'workflows.json')),workspace=new WorkspaceDeliverables(join(root,'workspace'),artifacts);
const plan=await artifacts.write({kind:'requirement_set',content:{requirements:[]},parentArtifactIds:[],revision:1});
await store.write({schemaVersion:1,workflows:{'wf-production':{id:'wf-production',carrier:'video',rootDirectory:root,state:'PRODUCING',revision:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),displayName:'第六节点 · 返工流程测试',summary:'独立测试，不包含真实项目审批',context:{requirementSetArtifactId:plan.artifactId,artifactRefs:[plan]},events:[],idempotency:{}}}});
await workspace.sync({workflowId:'wf-production',carrier:'video',rootDirectory:root,state:'PRODUCING',revision:1,summary:'独立制作子流程测试',artifactRefs:[plan],workspaceScope:workspace.scopeFor('wf-production','video')});
const service=new WorkflowService(store,artifacts);
let r=await service.updateVideoProduction({workflowId:'wf-production',expectedRevision:1,action:'start',reason:'测试制作流程',idempotencyKey:'start'});
r=await service.updateVideoProduction({workflowId:'wf-production',expectedRevision:r.revision,action:'task',title:'确认录屏与口播素材可用',status:'done',artifactIds:[plan.artifactId],reason:'测试素材检查记录',idempotencyKey:'task'});
await service.updateVideoProduction({workflowId:'wf-production',expectedRevision:r.revision,action:'submit',artifactIds:[plan.artifactId],reason:'测试素材交付，请检查阶段确认与返工',idempotencyKey:'submit'});
const server=createReviewHost({dataDirectory:root});server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({root,url:'http://127.0.0.1:'+server.address().port+'/?workflowId=wf-production#step-6'})));
