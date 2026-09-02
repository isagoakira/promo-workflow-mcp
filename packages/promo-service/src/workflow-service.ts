import { randomUUID } from "node:crypto";

import type { ArticleManuscriptMaster, ArticlePlatformBranch, PlatformProfile, WorkflowState } from "@promo-workflow/contracts";
import {
  CONTENT_BUDGETS,
  type ContentBudget,
  type ContentMaster,
  type CreativeRoute,
  type LockedCreativeOutline,
  type MasterReview,
  type ProductionLockedCapsule,
  type ProductionUnit,
  type ScenarioGrillQuestion,
} from "@promo-workflow/contracts";
import { buildArticleAssemblerOutput, type AcceptedArticleAssetResult } from "./article-assembler-adapter.js";

import { createAgentWorkCapsule, createGuidanceRequest, type GuidanceId } from "./agent-work.js";
import { ArtifactStore } from "./artifacts/store.js";
import type { ArtifactRef } from "./artifacts/types.js";
import { createBaselineBrief, readBaselineProposal } from "./baseline.js";
import { assertOutlineGrillCapacity, createCreativeOutlineBrief, readCreativeOutlineDraft } from "./creative-outline.js";
import { unavailableCutWorkbenchBridge, runCutWorkbenchBridge, type CutWorkbenchBridge, type CutWorkbenchProductionResult } from "./cut-workbench-bridge.js";
import { unavailableVectCutBridge, runVectCutBridge, type VectCutBridge, type VectCutDraftResult, type VectCutMediaSource } from "./vectcut-bridge.js";
import { createMasterDevelopmentBrief, readMasterDraft, validateMasterDraft } from "./master-development.js";
import { createArticleProductionArtifacts, createProductionUnitPlan, getArticleReviewGate, getProductionControl, type ProductionUnitPlan } from "./production.js";
import { validateProductionResults, type ProductionUnitAcceptanceResult } from "./production-results.js";
import { compileRequirements, type CompiledRequirementSet, type MasterAssetUsage } from "./requirements-compiler.js";
import { createOutlineScript, createPreproductionMaterialPlan, createRecordingExecution, createSpokenScript } from "./video-preproduction-deliverables.js";
import { createReleasePackagingBrief, getProductionArtifactIds, readReleasePackagingDraft, validateReleasePackagingDraft } from "./release-packaging.js";
import { createFetchBrief, TopicMatchingEngine } from "./selection/matcher.js";
import type { SelectionEngine } from "./selection/types.js";
import { JsonWorkflowStore } from "./store.js";
import { loadGuidance } from "./guidance-catalog.js";
import { WorkspaceDeliverables, type WorkspaceDeliverableRef } from "./workspace-deliverables.js";
import type {
  PendingAction,
  WorkflowCarrier,
  WorkflowEventKind,
  WorkflowRecord,
  WorkflowSnapshot,
} from "./types.js";

const RUN_TRANSITIONS: Partial<Record<WorkflowState, WorkflowState>> = {
  READY: "FETCHING",
  MATCHING: "AWAITING_SELECTION",
  TOPIC_LOCKED: "ALIGNING_BASELINE",
  BASELINE_LOCKED: "ALIGNING_OUTLINE",
  OUTLINE_LOCKED: "ALIGNING_MASTER",
  MASTER_LOCKED: "REQUIREMENTS_READY",
  REQUIREMENTS_READY: "PRODUCING",
  PRODUCING: "PRODUCING",
  PRODUCTION_LOCKED: "PACKAGING",
};

const COMMIT_TRANSITIONS = {
  submit_fetched_topics: { from: "FETCHING", to: "MATCHING", event: "fetched_topics_submitted" },
  select_topic: { from: "AWAITING_SELECTION", to: "TOPIC_LOCKED", event: "topic_selected" },
  propose_baseline: { from: "ALIGNING_BASELINE", to: "ALIGNING_BASELINE", event: "baseline_proposed" },
  answer_baseline_grill: { from: "ALIGNING_BASELINE", to: "ALIGNING_BASELINE", event: "baseline_grill_answered" },
  lock_baseline: { from: "ALIGNING_BASELINE", to: "BASELINE_LOCKED", event: "baseline_locked" },
  propose_creative_routes: { from: "ALIGNING_OUTLINE", to: "ALIGNING_OUTLINE", event: "creative_routes_proposed" },
  select_creative_route: { from: "ALIGNING_OUTLINE", to: "ALIGNING_OUTLINE", event: "creative_route_selected" },
  submit_outline_draft: { from: "ALIGNING_OUTLINE", to: "ALIGNING_OUTLINE", event: "outline_draft_submitted" },
  answer_outline_grill: { from: "ALIGNING_OUTLINE", to: "ALIGNING_OUTLINE", event: "outline_grill_answered" },
  lock_outline: { from: "ALIGNING_OUTLINE", to: "OUTLINE_LOCKED", event: "outline_locked" },
  submit_master_draft: { from: "ALIGNING_MASTER", to: "ALIGNING_MASTER", event: "master_draft_submitted" },
  answer_master_grill: { from: "ALIGNING_MASTER", to: "ALIGNING_MASTER", event: "master_grill_answered" },
  lock_master: { from: "ALIGNING_MASTER", to: "MASTER_LOCKED", event: "master_locked" },
  update_production_units: { from: "PRODUCING", to: "PRODUCING", event: "production_units_updated" },
  lock_production: { from: "PRODUCING", to: "PRODUCTION_LOCKED", event: "production_locked" },
  submit_release_package: { from: "PACKAGING", to: "PACKAGING", event: "release_package_submitted" },
  select_release_package: { from: "PACKAGING", to: "RELEASE_READY", event: "release_locked" },
} as const satisfies Record<
  string,
  { from: WorkflowState; to: WorkflowState; event: WorkflowEventKind }
>;

export type CommitKind = keyof typeof COMMIT_TRANSITIONS | "save_note";

export interface CreateWorkflowInput {
  carrier: WorkflowCarrier;
  summary: string;
  context: Record<string, unknown>;
  idempotencyKey: string;
}

export interface RunWorkflowInput {
  workflowId: string;
  expectedRevision: number;
  idempotencyKey: string;
}

export interface CommitWorkflowInput {
  workflowId: string;
  expectedRevision: number;
  kind: CommitKind;
  summary: string;
  context: Record<string, unknown>;
  idempotencyKey: string;
}

export class WorkflowService {
  constructor(
    private readonly store: JsonWorkflowStore,
    private readonly artifacts: ArtifactStore,
    private readonly selectionEngine: SelectionEngine = new TopicMatchingEngine(),
    private readonly cutWorkbenchBridge: CutWorkbenchBridge = unavailableCutWorkbenchBridge,
    private readonly vectCutBridge: VectCutBridge = unavailableVectCutBridge,
    private readonly workspace?: WorkspaceDeliverables,
  ) {}

  async create(input: CreateWorkflowInput): Promise<WorkflowSnapshot> {
    const data = await this.store.read();
    const existing = findIdempotentSnapshot(data, input.idempotencyKey);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const id = `wf_${randomUUID()}`;
    const record: WorkflowRecord = {
      id,
      carrier: input.carrier,
      state: "READY",
      revision: 1,
      createdAt: now,
      updatedAt: now,
      summary: input.summary,
      context: input.context,
      events: [],
      idempotency: {},
    };
    appendEvent(record, "workflow_created", "Workflow created; run the matching step next.");
    await this.syncWorkspace(record);
    const snapshot = await this.toSnapshot(record);
    record.idempotency[input.idempotencyKey] = snapshot;
    data.workflows[id] = record;
    await this.store.write(data);
    return snapshot;
  }

  async get(workflowId: string): Promise<WorkflowSnapshot> {
    const data = await this.store.read();
    return this.toSnapshot(requireWorkflow(data.workflows[workflowId], workflowId));
  }

  async list(): Promise<WorkflowSnapshot[]> {
    const data = await this.store.read();
    const snapshots = await Promise.all(Object.values(data.workflows).map((record) => this.toSnapshot(record)));
    return snapshots.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  /** Resolves only the full MCP-owned guidance declared by the current node. */
  async guidance(workflowId: string, requestedIds?: readonly GuidanceId[]): Promise<Record<string, unknown>> {
    const data = await this.store.read();
    const record = requireWorkflow(data.workflows[workflowId], workflowId);
    const work = agentWorkFor(record.context);
    if (!work?.guidance) {
      throw new Error("当前节点没有可加载的指导。请先调用 promo_run 生成 agentWork。");
    }
    const allowedIds = work.guidance.policies.map((policy) => policy.id);
    const ids = requestedIds === undefined ? allowedIds : [...new Set(requestedIds)];
    const unavailable = ids.filter((id) => !allowedIds.includes(id));
    if (unavailable.length > 0) {
      throw new Error(`当前节点不允许加载指导：${unavailable.join(", ")}。可用：${allowedIds.join(", ")}。`);
    }
    return {
      workflowId: record.id,
      state: record.state,
      stage: work.stage,
      guides: loadGuidance(ids),
      workspaceDeliverables: workspaceDeliverablesFor(record.context),
    };
  }

  async run(input: RunWorkflowInput): Promise<WorkflowSnapshot> {
    const data = await this.store.read();
    const record = requireWorkflow(data.workflows[input.workflowId], input.workflowId);
    const repeated = record.idempotency[input.idempotencyKey];
    if (repeated) {
      return repeated;
    }
    assertRevision(record, input.expectedRevision);

    const next = RUN_TRANSITIONS[record.state];
    if (!next) {
      throw new Error(`State ${record.state} has no automatic step. ${pendingActionFor(record.state)?.instruction ?? "Commit the pending action."}`);
    }
    if (record.state === "READY") {
      const fetchBrief = createFetchBrief(record.context);
      record.context = { ...record.context, fetchBrief, agentWork: fetchBrief };
      record.summary = "已生成选材抓取任务；等待 Agent 回填来源材料卡。";
    } else if (record.state === "MATCHING") {
      const topicMatch = await this.selectionEngine.run(await this.contextForMatching(record.context));
      const artifact = await this.artifacts.write({
        kind: "topic_match",
        content: topicMatch,
        parentArtifactIds: artifactIdsFor(record.context),
      });
      record.context = withArtifact(record.context, artifact, { topicMatchArtifactId: artifact.artifactId });
      record.summary = `已完成双向选材匹配：${topicMatch.candidates.length} 个候选题待确认。`;
    } else if (record.state === "TOPIC_LOCKED") {
      const agentWork = await this.createBaselineBrief(record.context, record.carrier);
      record.context = { ...record.context, agentWork };
      record.summary = "已生成基调对齐任务；等待 Agent 提交宣传核心和用户引导意图。";
    } else if (record.state === "BASELINE_LOCKED") {
      const agentWork = await this.createCreativeRouteBrief(record);
      record.context = { ...record.context, agentWork };
      record.summary = "已生成 2–3 条场景化创意路线；先由用户选定一条，再进入大纲细化。";
    } else if (record.state === "OUTLINE_LOCKED") {
      const agentWork = await this.createMasterDevelopmentBrief(record);
      record.context = { ...record.context, agentWork };
      record.summary = "已生成主稿扩写任务；等待 Agent 提交分镜主稿或完整文章草稿。";
    } else if (record.state === "MASTER_LOCKED") {
      const requirements = await this.compileRequirements(record);
      const artifact = await this.artifacts.write({
        kind: "requirement_set",
        content: {
          ...requirements,
          derivedFrom: {
            contentMasterArtifactId: requireText(record.context.contentMasterArtifactId, "contentMasterArtifactId"),
            derivedAt: new Date().toISOString(),
          },
        },
        parentArtifactIds: artifactIdsFor(record.context),
      });
      let nextContext = withArtifact(record.context, artifact, { requirementSetArtifactId: artifact.artifactId });
      if (record.carrier === "video") {
        const contentMaster = await this.contentMasterFor(record.context);
        if (contentMaster.master.carrier !== "video") throw new Error("Video requirements require a locked video master.");
        const materialPlan = await this.artifacts.write({
          kind: "preproduction_material_plan",
          content: createPreproductionMaterialPlan(contentMaster.master, requirements),
          parentArtifactIds: [artifact.artifactId],
        });
        nextContext = withArtifact(nextContext, materialPlan, {
          preproductionMaterialPlanArtifactId: materialPlan.artifactId,
        });
      }
      record.context = nextContext;
      record.summary = "已从主稿生成前期素材执行包和视频字幕计划。";
    } else if (record.state === "REQUIREMENTS_READY") {
      const plan = await this.createProductionPlan(record);
      const usesVectCut = record.carrier === "video" && videoBackendFor(record.context) === "vectcut";
      const artifact = await this.artifacts.write({
        kind: "production_plan",
        content: plan,
        parentArtifactIds: artifactIdsFor(record.context),
      });
      const control = getProductionControl(plan.units);
      const agentWork = createAgentWorkCapsule({
        stage: "production",
        inputs: { requirements: plan, carrier: record.carrier, ...(usesVectCut ? { videoBackend: "vectcut" } : {}) },
        constraints: [
          "Use only human, generative, or local production routes.",
          "Reuse accepted source assets rather than creating duplicate production units.",
          "Product, people, factual, interview, or screen-capture evidence must remain on a human/reviewable path.",
          "Update only the status of existing production units, then lock only after every unit is accepted.",
          ...(usesVectCut ? ["Provide one reachable videoUrl for every locked video asset usage; VectCut only creates an editable draft and still requires human review."] : []),
        ],
        requestedOutput: {
          description: "Updated production units and one evidence-linked acceptance result for each accepted unit.",
          fields: usesVectCut ? ["units", "productionResults", "vectcutMediaSources"] : ["units", "productionResults"],
        },
        validationRules: [
          "Submit progress through promo_commit(kind=update_production_units).",
          "When every unit is accepted, call promo_run to assemble the article preview or invoke the configured video bridge before lock_production.",
          ...(usesVectCut ? ["After VectCut generates the draft, review it in the editor before lock_production; submit vectcutDraftAccepted and vectcutReviewNote only after that review."] : []),
        ],
        nextCommitKind: "update_production_units",
        guidance: createGuidanceRequest(record.carrier === "article" ? ["appso-visual-proof"] : []),
      });
      record.context = withArtifact(record.context, artifact, {
        productionPlanArtifactId: artifact.artifactId,
        productionUnits: plan.units,
        agentWork,
      });
      record.summary = control.complete
        ? "制作需求均已有可复用素材；等待确认制作成品。"
        : "已生成最小制作单元；等待人机协作推进并回填状态。";
    } else if (record.state === "PRODUCING") {
      const plan = await this.productionPlanFor(record.context);
      const units = readProductionUnits(record.context.productionUnits);
      const control = getProductionControl(units);
      if (!control.complete) {
        throw new Error("Production is not ready for backend assembly. Update every required production unit first.");
      }
      const results = this.productionResultsFor(record.context, plan.units, units);
      if (record.carrier === "article") {
        const output = await this.assembleArticle(record, units, results);
        record.context = {
          ...record.context,
          ...output,
          agentWork: createAgentWorkCapsule({
            stage: "production",
            inputs: { articleProductionArtifacts: output.articleProductionArtifacts, articleAssemblerReference: output.articleAssemblerReference },
            constraints: [
              "Review the local preview without changing the locked proposition, section purposes, evidence boundary, or accepted asset mapping.",
              "Every visual must remain adjacent to its intended anchor and prove the nearby judgment rather than decorate it.",
              "Check that human center, author stance, warm thread, and emotional movement remain readable after layout.",
            ],
            requestedOutput: { description: "A local article preview review before production lock.", fields: ["previewAccepted", "findings"] },
            validationRules: ["Submit previewAccepted: true only through promo_commit(kind=lock_production).", "Return to the affected upstream artifact when a finding changes locked meaning or evidence."],
            nextCommitKind: "lock_production",
            guidance: createGuidanceRequest(["appso-preview-review"]),
          }),
        };
        const handoff = await this.artifacts.write({
          kind: "production_handoff",
          content: { backend: "article_assembler", checkpointArtifactId: record.context.productionCheckpointArtifactId, outputArtifacts: record.context.articleProductionArtifacts, handedOffAt: new Date().toISOString() },
          parentArtifactIds: artifactIdsFor(record.context), revision: record.revision + 1,
        });
        record.context = withArtifact(record.context, handoff, { productionHandoffArtifactId: handoff.artifactId });
        record.summary = "已生成文章内容块、素材清单与本地预览；等待一次完整预览确认。";
      } else {
        const bridgeResult = await this.runVideoBridge(record, results);
        if (bridgeResult.kind === "capability_gap") {
          record.context = { ...record.context, productionCapabilityGap: bridgeResult };
          record.summary = `视频制作桥不可用：${bridgeResult.reason}`;
        } else if (bridgeResult.kind === "draft_result") {
          const artifact = await this.artifacts.write({
            kind: "vectcut_draft",
            content: bridgeResult,
            parentArtifactIds: artifactIdsFor(record.context),
            revision: bridgeResult.reference.revision,
          });
          record.context = withArtifact(record.context, artifact, {
            vectcutResult: bridgeResult,
            vectcutDraftArtifactId: artifact.artifactId,
          });
          const handoff = await this.artifacts.write({
            kind: "production_handoff",
            content: { backend: "vectcut", checkpointArtifactId: record.context.productionCheckpointArtifactId, result: bridgeResult, handedOffAt: new Date().toISOString() },
            parentArtifactIds: artifactIdsFor(record.context), revision: record.revision + 1,
          });
          record.context = withArtifact(record.context, handoff, { productionHandoffArtifactId: handoff.artifactId });
          record.summary = "VectCut 已生成可编辑草稿并导入 SRT；请在剪映/CapCut 审核，需要改动时先回退对应制作单元。";
        } else {
          const handoff = await this.artifacts.write({
            kind: "production_handoff",
            content: { backend: "cut_workbench", checkpointArtifactId: record.context.productionCheckpointArtifactId, result: bridgeResult, handedOffAt: new Date().toISOString() },
            parentArtifactIds: artifactIdsFor(record.context), revision: record.revision + 1,
          });
          record.context = withArtifact(record.context, handoff, { cutWorkbenchResult: bridgeResult, productionHandoffArtifactId: handoff.artifactId });
          record.summary = bridgeResult.finalGate.passed
            ? "Cut Workbench 已返回已验证的视频成品引用；等待最终锁定。"
            : "Cut Workbench 项目已建立或同步；请在其生产工作流完成终剪、字幕、验证和交付门禁后，再次运行 promo_run。";
        }
      }
    } else if (record.state === "PRODUCTION_LOCKED") {
      const production = await this.productionFor(record.context);
      const agentWork = createReleasePackagingBrief({
        production,
        evidenceSources: readReleaseEvidenceSources(record.context.releaseEvidenceSources),
        platformContext: record.context.platformContext,
      });
      record.context = { ...record.context, agentWork };
      record.summary = "已生成发布包装任务；等待三标题、两封面和简介/摘要草案。";
    } else {
      record.summary = `Automatic step completed: ${next}.`;
    }
    record.state = next;
    record.revision += 1;
    record.updatedAt = new Date().toISOString();
    appendEvent(record, "automatic_step", record.summary);
    await this.syncWorkspace(record);
    const snapshot = await this.toSnapshot(record);
    record.idempotency[input.idempotencyKey] = snapshot;
    await this.store.write(data);
    return snapshot;
  }

  async commit(input: CommitWorkflowInput): Promise<WorkflowSnapshot> {
    const data = await this.store.read();
    const record = requireWorkflow(data.workflows[input.workflowId], input.workflowId);
    const repeated = record.idempotency[input.idempotencyKey];
    if (repeated) {
      return repeated;
    }
    assertRevision(record, input.expectedRevision);

    if (input.kind === "save_note") {
      record.context = { ...record.context, ...input.context };
      record.summary = input.summary;
      record.revision += 1;
      record.updatedAt = new Date().toISOString();
      appendEvent(record, "note_saved", input.summary);
    } else {
      const transition = COMMIT_TRANSITIONS[input.kind];
      if (record.state !== transition.from) {
        throw new Error(`Commit ${input.kind} is only valid in ${transition.from}; current state is ${record.state}.`);
      }
      if (input.kind === "submit_fetched_topics") {
        const fetchedTopics = input.context.fetchedTopics;
        if (!Array.isArray(fetchedTopics)) {
          throw new Error("submit_fetched_topics requires context.fetchedTopics.");
        }
        const artifact = await this.artifacts.write({
          kind: "fetched_topic_cards",
          content: fetchedTopics,
          parentArtifactIds: artifactIdsFor(record.context),
        });
        record.context = withArtifact(record.context, artifact, {
          ...without(input.context, ["fetchedTopics", "artifactRefs", "fetchedTopicsArtifactId"]),
          fetchedTopicsArtifactId: artifact.artifactId,
        });
      } else if (input.kind === "select_topic") {
        const topicMatch = await this.topicMatchFor(record.context);
        const topicId = requireText(input.context.topicId, "topicId");
        const topic = topicMatch?.candidates.find((candidate) => candidate.topicId === topicId);
        if (!topic) throw new Error(`Unknown topic ${topicId}.`);
        const selectedMaterials = readStringArray(input.context.selectedMaterials, "selectedMaterials");
        const artifact = await this.artifacts.write({
          kind: "selected_topic",
          content: { topic, selectedMaterials, selectedAt: new Date().toISOString() },
          parentArtifactIds: artifactIdsFor(record.context),
          revision: record.revision + 1,
        });
        record.context = withArtifact(record.context, artifact, {
          ...without(input.context, ["artifactRefs", "topicId", "selectedMaterials"]),
          topicId,
          selectedMaterials,
          selectedTopicArtifactId: artifact.artifactId,
        });
      } else if (input.kind === "propose_baseline") {
        const proposal = readBaselineProposal(input.context.baselineProposal);
        assertArticleEditorialIntent(record.carrier, proposal);
        assertDecisionsIncorporated(proposal.incorporatesDecisionIds, unresolvedDecisionIds(record.context));
        record.context = {
          ...record.context,
          ...without(input.context, ["baselineProposal"]),
          baselineProposal: proposal,
          unresolvedDecisionIds: [],
        };
      } else if (input.kind === "answer_baseline_grill") {
        const proposal = baselineProposalFor(record.context);
        if (!proposal?.pendingQuestion) throw new Error("No baseline scenario Grill question is pending.");
        const decision = readScenarioDecision(input.context, proposal.pendingQuestion, "baseline");
        const artifact = await this.artifacts.write({
          kind: "decision_ledger", content: decision, parentArtifactIds: artifactIdsFor(record.context), revision: record.revision + 1,
        });
        record.context = withArtifact(record.context, artifact, {
          baselineGrillCount: baselineGrillCount(record.context) + 1,
          unresolvedDecisionIds: [...unresolvedDecisionIds(record.context), decision.id],
          latestDecisionLedgerArtifactId: artifact.artifactId,
          agentWork: createBaselineRevisionBrief(proposal, decision, record.carrier),
        });
        delete record.context.baselineProposal;
      } else if (input.kind === "lock_baseline") {
        assertNoUnresolvedDecisions(record.context);
        const proposal = readBaselineProposal(input.context.baselineProposal ?? record.context.baselineProposal);
        assertArticleEditorialIntent(record.carrier, proposal);
        const artifact = await this.artifacts.write({
          kind: "baseline",
          content: {
            coreMessage: proposal.coreMessage,
            guidanceIntent: proposal.guidanceIntent,
            campaignIntent: proposal.campaignIntent,
            ...(proposal.articleEditorialIntent ? { articleEditorialIntent: proposal.articleEditorialIntent } : {}),
            topicId: record.context.topicId,
            confirmedAt: new Date().toISOString(),
          },
          parentArtifactIds: artifactIdsFor(record.context),
        });
        record.context = withArtifact(record.context, artifact, {
          ...without(input.context, ["baselineProposal", "artifactRefs", "baselineArtifactId"]),
          baselineArtifactId: artifact.artifactId,
        });
        delete record.context.baselineProposal;
        delete record.context.baselineGrillCount;
        delete record.context.unresolvedDecisionIds;
      } else if (input.kind === "propose_creative_routes") {
        const routes = readCreativeRoutes(input.context.creativeRoutes);
        const artifact = await this.artifacts.write({
          kind: "creative_routes", content: { routes, proposedAt: new Date().toISOString() }, parentArtifactIds: artifactIdsFor(record.context), revision: record.revision + 1,
        });
        record.context = withArtifact(record.context, artifact, { creativeRoutesArtifactId: artifact.artifactId });
      } else if (input.kind === "select_creative_route") {
        const routes = await this.creativeRoutesFor(record.context);
        const routeId = requireText(input.context.routeId, "routeId");
        const selectedRoute = routes.find((route) => route.id === routeId);
        if (!selectedRoute) throw new Error(`Unknown creative route ${routeId}.`);
        const artifact = await this.artifacts.write({
          kind: "creative_route_selection",
          content: { route: selectedRoute, selectedAt: new Date().toISOString() }, parentArtifactIds: artifactIdsFor(record.context), revision: record.revision + 1,
        });
        const nextContext = withArtifact(record.context, artifact, { selectedCreativeRouteArtifactId: artifact.artifactId });
        record.context = { ...nextContext, agentWork: await this.createCreativeOutlineBrief(record, selectedRoute) };
      } else if (input.kind === "submit_outline_draft") {
        const budget = await this.budgetFor(record.context, record.carrier);
        const draft = readCreativeOutlineDraft(input.context.outlineDraft, budget);
        const selectedRoute = await this.selectedCreativeRouteFor(record.context);
        if (draft.selectedRouteId !== selectedRoute.id) throw new Error("Outline draft must use the user-selected creative route.");
        assertDecisionsIncorporated(draft.incorporatesDecisionIds, unresolvedDecisionIds(record.context));
        const artifact = await this.artifacts.write({
          kind: "creative_outline_draft",
          content: draft,
          parentArtifactIds: artifactIdsFor(record.context),
        });
        record.context = withArtifact(record.context, artifact, {
          outlineDraftArtifactId: artifact.artifactId,
          outlineGrillCount: 0,
          unresolvedDecisionIds: [],
        });
      } else if (input.kind === "answer_outline_grill") {
        const draft = await this.outlineDraftFor(record.context);
        if (!draft.pendingQuestion) throw new Error("No outline scenario Grill question is pending.");
        const decision = readScenarioDecision(input.context, draft.pendingQuestion, "outline");
        const budget = await this.budgetFor(record.context, record.carrier);
        assertOutlineGrillCapacity(outlineGrillCount(record.context), budget);
        const artifact = await this.artifacts.write({
          kind: "decision_ledger", content: decision, parentArtifactIds: artifactIdsFor(record.context), revision: record.revision + 1,
        });
        const selectedRoute = await this.selectedCreativeRouteFor(record.context);
        record.context = withArtifact(record.context, artifact, {
          outlineGrillCount: outlineGrillCount(record.context) + 1,
          unresolvedDecisionIds: [...unresolvedDecisionIds(record.context), decision.id],
          latestDecisionLedgerArtifactId: artifact.artifactId,
          agentWork: await this.createCreativeOutlineBrief(record, selectedRoute, draft, decision),
        });
      } else if (input.kind === "lock_outline") {
        assertNoUnresolvedDecisions(record.context);
        const draft = await this.outlineDraftFor(record.context);
        if (draft.pendingQuestion) throw new Error("Answer the pending outline scenario Grill question and submit a revised outline before lock.");
        if (!draft.macroStyleReview.passed) throw new Error("Cannot lock an outline until macro style review passes.");
        const budget = await this.budgetFor(record.context, record.carrier);
        const artifact = await this.artifacts.write({
          kind: "creative_outline",
          content: {
            topicId: requireText(record.context.topicId, "topicId"),
            budget,
            ...draft,
            confirmedAt: new Date().toISOString(),
          },
          parentArtifactIds: artifactIdsFor(record.context),
        });
        let nextContext = withArtifact(record.context, artifact, { creativeOutlineArtifactId: artifact.artifactId });
        if (draft.outline.carrier === "video") {
          const outlineScript = await this.artifacts.write({
            kind: "outline_script",
            content: createOutlineScript({
              topicId: requireText(record.context.topicId, "topicId"), budget, ...draft, confirmedAt: new Date().toISOString(),
            }),
            parentArtifactIds: [artifact.artifactId],
          });
          nextContext = withArtifact(nextContext, outlineScript, { outlineScriptArtifactId: outlineScript.artifactId });
        }
        record.context = nextContext;
        delete record.context.outlineDraftArtifactId;
        delete record.context.outlineGrillCount;
        delete record.context.unresolvedDecisionIds;
      } else if (input.kind === "submit_master_draft") {
        const creativeOutline = await this.creativeOutlineFor(record.context);
        const master = readMasterDraft(input.context.masterDraft);
        const validation = validateMasterDraft(master, { budget: creativeOutline.budget });
        if (!validation.passed) throw new Error(`Master draft is invalid: ${validation.errors.join(" ")}`);
        const review = readMasterReview(input.context.masterReview, master.carrier);
        if (!review.passed) throw new Error("submit_master_draft requires a passed context.masterReview.");
        assertDecisionsIncorporated(readStringArrayOrEmpty(input.context.incorporatesDecisionIds, "incorporatesDecisionIds"), unresolvedDecisionIds(record.context));
        const pendingQuestion = optionalScenarioQuestion(input.context.masterGrillQuestion, "masterGrillQuestion");
        const reviewArtifact = await this.artifacts.write({
          kind: "master_review",
          content: {
            review,
            appliesTo: { carrier: master.carrier, workingTitle: master.carrier === "video" ? master.workingTitle : master.title },
            reviewedAt: new Date().toISOString(),
          },
          parentArtifactIds: artifactIdsFor(record.context),
          revision: record.revision + 1,
        });
        const afterReview = withArtifact(record.context, reviewArtifact, { masterReviewArtifactId: reviewArtifact.artifactId });
        const artifact = await this.artifacts.write({
          kind: "content_master_draft",
          content: { master, review, warnings: validation.warnings, pendingQuestion, incorporatesDecisionIds: readStringArrayOrEmpty(input.context.incorporatesDecisionIds, "incorporatesDecisionIds") },
          parentArtifactIds: artifactIdsFor(afterReview),
        });
        record.context = withArtifact(afterReview, artifact, { masterDraftArtifactId: artifact.artifactId, masterGrillCount: 0, unresolvedDecisionIds: [] });
      } else if (input.kind === "answer_master_grill") {
        const draft = await this.masterDraftFor(record.context);
        if (!draft.pendingQuestion) throw new Error("No master scenario Grill question is pending.");
        const decision = readScenarioDecision(input.context, draft.pendingQuestion, "master");
        const creativeOutline = await this.creativeOutlineFor(record.context);
        const limit = masterGrillCap(creativeOutline.budget);
        if (masterGrillCount(record.context) >= limit) throw new Error(`Master Grill limit reached (${limit} questions).`);
        const artifact = await this.artifacts.write({
          kind: "decision_ledger", content: decision, parentArtifactIds: artifactIdsFor(record.context), revision: record.revision + 1,
        });
        record.context = withArtifact(record.context, artifact, {
          masterGrillCount: masterGrillCount(record.context) + 1,
          unresolvedDecisionIds: [...unresolvedDecisionIds(record.context), decision.id],
          latestDecisionLedgerArtifactId: artifact.artifactId,
          agentWork: createMasterRevisionBrief(creativeOutline, draft.master, decision),
        });
      } else if (input.kind === "lock_master") {
        assertNoUnresolvedDecisions(record.context);
        const draft = await this.masterDraftFor(record.context);
        if (draft.pendingQuestion) throw new Error("Answer the pending master scenario Grill question and submit a revised master before lock.");
        const creativeOutline = await this.creativeOutlineFor(record.context);
        const artifact = await this.artifacts.write({
          kind: "content_master",
          content: {
            topicId: requireText(record.context.topicId, "topicId"),
            budget: creativeOutline.budget,
            master: draft.master,
            review: draft.review,
            confirmedAt: new Date().toISOString(),
          },
          parentArtifactIds: artifactIdsFor(record.context),
        });
        let nextContext = withArtifact(record.context, artifact, { contentMasterArtifactId: artifact.artifactId });
        if (draft.master.carrier === "video") {
          const spokenScript = await this.artifacts.write({
            kind: "spoken_script", content: createSpokenScript(draft.master), parentArtifactIds: [artifact.artifactId],
          });
          const recordingExecution = await this.artifacts.write({
            kind: "recording_execution", content: createRecordingExecution(draft.master), parentArtifactIds: [artifact.artifactId, spokenScript.artifactId],
          });
          nextContext = withArtifacts(nextContext, [spokenScript, recordingExecution], {
            spokenScriptArtifactId: spokenScript.artifactId,
            recordingExecutionArtifactId: recordingExecution.artifactId,
          });
        }
        record.context = nextContext;
        delete record.context.masterDraftArtifactId;
        delete record.context.masterGrillCount;
        delete record.context.unresolvedDecisionIds;
      } else if (input.kind === "update_production_units") {
        const units = readProductionUnits(input.context.units);
        const plan = await this.productionPlanFor(record.context);
        assertProductionUnitUpdate(plan.units, units);
        const results = validateProductionResults({
          plannedUnits: plan.units,
          currentUnits: units,
          results: readProductionResults(input.context.productionResults),
        });
        const checkpoint = await this.artifacts.write({
          kind: "production_checkpoint",
          content: {
            plannedUnits: plan.units,
            currentUnits: units,
            acceptanceResults: results,
            updatedAt: new Date().toISOString(),
          },
          parentArtifactIds: artifactIdsFor(record.context),
          revision: record.revision + 1,
        });
        record.context = withArtifact(record.context, checkpoint, {
          ...without(input.context, ["units", "productionResults", "artifactRefs"]),
          productionUnits: units,
          productionResults: results,
          productionCheckpointArtifactId: checkpoint.artifactId,
        });
        delete record.context.productionCapabilityGap;
        delete record.context.cutWorkbenchResult;
        delete record.context.vectcutResult;
        delete record.context.vectcutDraftArtifactId;
      } else if (input.kind === "lock_production") {
        const plan = await this.productionPlanFor(record.context);
        const units = readProductionUnits(record.context.productionUnits);
        assertProductionUnitUpdate(plan.units, units);
        const control = getProductionControl(units);
        if (!control.complete) throw new Error("Cannot lock production until every production unit is accepted.");
        const results = this.productionResultsFor(record.context, plan.units, units);
        const production = record.carrier === "article"
          ? await this.lockAssembledArticle(record, units, input.context)
          : this.lockVideoProduction(record, input.context);
        const artifact = await this.artifacts.write({
          kind: "production_locked",
          content: production,
          parentArtifactIds: artifactIdsFor(record.context),
        });
        record.context = withArtifact(record.context, artifact, { productionArtifactId: artifact.artifactId });
        delete record.context.productionUnits;
      } else if (input.kind === "submit_release_package") {
        const production = await this.productionFor(record.context);
        const draft = readReleasePackagingDraft(input.context.releasePackageDraft);
        if (draft.carrier !== record.carrier) throw new Error("Release package carrier does not match workflow carrier.");
        const validation = validateReleasePackagingDraft(draft, {
          allowedEvidenceArtifactIds: [
            ...getProductionArtifactIds(production),
            ...readReleaseEvidenceSources(record.context.releaseEvidenceSources).map((source) => source.artifactId),
          ],
        });
        if (!validation.passed) throw new Error(`Release package is invalid: ${validation.errors.join(" ")}`);
        const artifact = await this.artifacts.write({
          kind: "release_package_draft",
          content: { draft, warnings: validation.warnings },
          parentArtifactIds: artifactIdsFor(record.context),
        });
        record.context = withArtifact(record.context, artifact, { releasePackageDraftArtifactId: artifact.artifactId });
      } else if (input.kind === "select_release_package") {
        const draft = await this.releasePackageDraftFor(record.context);
        const titleId = requireText(input.context.titleId, "titleId");
        const coverId = requireText(input.context.coverId, "coverId");
        if (!draft.titleCandidates.some((candidate) => candidate.id === titleId)) throw new Error(`Unknown release title ${titleId}.`);
        if (!draft.coverCandidates.some((candidate) => candidate.id === coverId)) throw new Error(`Unknown release cover ${coverId}.`);
        const artifact = await this.artifacts.write({
          kind: "release_package",
          content: { draft, titleId, coverId, selectedAt: new Date().toISOString() },
          parentArtifactIds: artifactIdsFor(record.context),
        });
        record.context = withArtifact(record.context, artifact, { releasePackageArtifactId: artifact.artifactId });
      } else {
        record.context = { ...record.context, ...input.context };
      }
      record.state = transition.to;
      record.summary = input.summary;
      record.revision += 1;
      record.updatedAt = new Date().toISOString();
      appendEvent(record, transition.event, input.summary);
    }

    await this.syncWorkspace(record);
    const snapshot = await this.toSnapshot(record);
    record.idempotency[input.idempotencyKey] = snapshot;
    await this.store.write(data);
    return snapshot;
  }

  private async contextForMatching(context: Record<string, unknown>): Promise<Record<string, unknown>> {
    const artifactId = context.fetchedTopicsArtifactId;
    if (typeof artifactId !== "string") {
      throw new Error("Matching requires a fetched topic-card artifact.");
    }
    const artifact = await this.artifacts.read(artifactId);
    if (artifact.kind !== "fetched_topic_cards" || !Array.isArray(artifact.content)) {
      throw new Error("Fetched topic-card artifact is invalid.");
    }
    return { ...context, fetchedTopics: artifact.content };
  }

  private async createBaselineBrief(context: Record<string, unknown>, carrier: WorkflowCarrier) {
    const topicId = context.topicId;
    const topicMatchArtifactId = context.topicMatchArtifactId;
    if (typeof topicId !== "string" || typeof topicMatchArtifactId !== "string") {
      throw new Error("Baseline alignment requires a locked topic and topic-match artifact.");
    }
    const topicMatch = await this.artifacts.read(topicMatchArtifactId);
    if (topicMatch.kind !== "topic_match" || !isRecord(topicMatch.content) || !Array.isArray(topicMatch.content.candidates)) {
      throw new Error("Topic-match artifact is invalid.");
    }
    const topic = topicMatch.content.candidates.find((candidate) => isRecord(candidate) && candidate.topicId === topicId);
    if (!isRecord(topic)) throw new Error(`Locked topic ${topicId} is not in the topic-match artifact.`);
    return createBaselineBrief({
      carrier,
      topic: topic as unknown as Parameters<typeof createBaselineBrief>[0]["topic"],
      productProfile: context.productProfile,
      selectedMaterials: context.selectedMaterials ?? [topic.url],
    });
  }

  private async budgetFor(context: Record<string, unknown>, carrier: WorkflowCarrier): Promise<ContentBudget> {
    const tier = context.contentTier;
    if (tier !== undefined && tier !== "short" && tier !== "standard" && tier !== "long") {
      throw new Error("contentTier must be short, standard, or long.");
    }
    return CONTENT_BUDGETS[carrier][tier ?? "standard"];
  }

  private async createCreativeRouteBrief(record: WorkflowRecord) {
    const baseline = await this.baselineFor(record.context);
    return createAgentWorkCapsule({
      stage: "creative_outline",
      inputs: {
        topicId: requireText(record.context.topicId, "topicId"),
        baseline,
        selectedMaterials: readStringArray(record.context.selectedMaterials, "selectedMaterials"),
        productProfile: record.context.productProfile,
      },
      constraints: [
        "Propose exactly 2-3 mutually exclusive creative routes before writing an outline.",
        "Each route begins in a specific reader scene, names the tension, and explains how it will prove the point.",
        "Do not write a generic product-feature sequence or a finished manuscript at this stage.",
      ],
      requestedOutput: {
        description: "2-3 scene-led creative routes for the user to choose from.",
        fields: ["creativeRoutes"],
      },
      validationRules: [
        "Each route requires id, name, centralTension, openingScene, proofMethod, readerShift, and whyThisRoute.",
        "Submit through promo_commit(kind=propose_creative_routes).",
      ],
      nextCommitKind: "propose_creative_routes",
      decisionCard: {
        node: 3,
        label: "创意路线选择",
        known: ["宣传意图已锁定。"],
        recommendation: "先把同一主张拆成不同的真实场景，选最能让目标读者代入的一条。",
        userDecision: "从 2-3 条路线中选择一条。",
        whyItMatters: "路线一旦选定，后续 Grill 只细化它，不再让大纲在多个方向间摇摆。",
        nextArtifact: "03-creative-outline/creative-routes.json",
      },
      deliverable: {
        name: "creative routes",
        workspaceFile: "03-creative-outline/creative-routes.json",
        purpose: "用户已比较过的创意方向及其选择依据。",
      },
      guidance: createGuidanceRequest(record.carrier === "video"
        ? ["promo-writing-supervision", "product-voiceover-campaign", "promo-deliverable-exemplars"]
        : ["promo-writing-supervision", "appso-human-center-outline"]),
    });
  }

  private async createCreativeOutlineBrief(
    record: WorkflowRecord,
    selectedRoute: CreativeRoute,
    priorDraft?: ReturnType<typeof readCreativeOutlineDraft>,
    decision?: Record<string, unknown>,
  ) {
    const baseline = await this.baselineFor(record.context);
    return createCreativeOutlineBrief({
      topicId: requireText(record.context.topicId, "topicId"),
      baseline,
      selectedMaterials: readStringArray(record.context.selectedMaterials, "selectedMaterials"),
      productProfile: record.context.productProfile,
      budget: await this.budgetFor(record.context, record.carrier),
      recommendedStoryEngine: optionalText(record.context.recommendedStoryEngine),
      selectedRoute,
      ...(priorDraft ? { priorDraft } : {}),
      ...(decision ? { latestDecision: decision } : {}),
    });
  }

  private async creativeRoutesFor(context: Record<string, unknown>): Promise<CreativeRoute[]> {
    const content = await this.readArtifactContent(context.creativeRoutesArtifactId, "creative_routes");
    if (!isRecord(content) || !Array.isArray(content.routes)) throw new Error("Creative-routes artifact is invalid.");
    return readCreativeRoutes(content.routes);
  }

  private async selectedCreativeRouteFor(context: Record<string, unknown>): Promise<CreativeRoute> {
    const content = await this.readArtifactContent(context.selectedCreativeRouteArtifactId, "creative_route_selection");
    if (!isRecord(content) || !isRecord(content.route)) throw new Error("A creative route must be selected before drafting the outline.");
    return readCreativeRoute(content.route, "selected route");
  }

  private async createMasterDevelopmentBrief(record: WorkflowRecord) {
    const creativeOutline = await this.creativeOutlineFor(record.context);
    return createMasterDevelopmentBrief({
      creativeOutline,
      selectedMaterials: readStringArray(record.context.selectedMaterials, "selectedMaterials"),
      productContext: record.context.productProfile,
    });
  }

  private async baselineFor(context: Record<string, unknown>) {
    return await this.readArtifactContent(context.baselineArtifactId, "baseline") as Parameters<typeof createCreativeOutlineBrief>[0]["baseline"];
  }

  private async outlineDraftFor(context: Record<string, unknown>) {
    return await this.readArtifactContent(context.outlineDraftArtifactId, "creative_outline_draft") as ReturnType<typeof readCreativeOutlineDraft>;
  }

  private async creativeOutlineFor(context: Record<string, unknown>): Promise<LockedCreativeOutline> {
    return await this.readArtifactContent(context.creativeOutlineArtifactId, "creative_outline") as LockedCreativeOutline;
  }

  private async masterDraftFor(context: Record<string, unknown>): Promise<{ master: ContentMaster; review: MasterReview; pendingQuestion: ScenarioGrillQuestion | null }> {
    const content = await this.readArtifactContent(context.masterDraftArtifactId, "content_master_draft");
    if (!isRecord(content) || !isRecord(content.review)) throw new Error("Master draft artifact is invalid.");
    const master = readMasterDraft(content.master);
    return {
      master,
      review: readMasterReview(content.review, master.carrier),
      pendingQuestion: optionalScenarioQuestion(content.pendingQuestion, "content_master_draft.pendingQuestion"),
    };
  }

  private async contentMasterFor(context: Record<string, unknown>) {
    return await this.readArtifactContent(context.contentMasterArtifactId, "content_master") as {
      topicId: string;
      budget: ContentBudget;
      master: ContentMaster;
      review: Record<string, unknown>;
      confirmedAt: string;
    };
  }

  private async compileRequirements(record: WorkflowRecord): Promise<CompiledRequirementSet> {
    const contentMaster = await this.contentMasterFor(record.context);
    const assetUsages = toMasterAssetUsages(contentMaster.master);
    return compileRequirements({
      carrier: record.carrier,
      assetUsages,
      ...(contentMaster.master.carrier === "video" ? { videoDurationMs: contentMaster.master.targetDurationSeconds * 1000 } : {}),
    });
  }

  private async requirementSetFor(context: Record<string, unknown>) {
    return await this.readArtifactContent(context.requirementSetArtifactId, "requirement_set") as CompiledRequirementSet;
  }

  private async createProductionPlan(record: WorkflowRecord): Promise<ProductionUnitPlan> {
    const requirements = await this.requirementSetFor(record.context);
    return createProductionUnitPlan({
      requirements: requirements.requirements,
      acceptedSourceAssetIds: readStringArrayOrEmpty(record.context.acceptedSourceAssetIds, "acceptedSourceAssetIds"),
      routeHints: readRouteHints(record.context.routeHints),
      supportedRoutes: readSupportedRoutes(record.context.supportedProductionRoutes),
    });
  }

  private async productionPlanFor(context: Record<string, unknown>): Promise<ProductionUnitPlan> {
    return await this.readArtifactContent(context.productionPlanArtifactId, "production_plan") as ProductionUnitPlan;
  }

  private async productionFor(context: Record<string, unknown>): Promise<ProductionLockedCapsule> {
    return await this.readArtifactContent(context.productionArtifactId, "production_locked") as ProductionLockedCapsule;
  }

  private productionResultsFor(
    context: Record<string, unknown>,
    plannedUnits: readonly ProductionUnit[],
    currentUnits: readonly ProductionUnit[],
  ): readonly ProductionUnitAcceptanceResult[] {
    return validateProductionResults({
      plannedUnits,
      currentUnits,
      results: readProductionResults(context.productionResults),
    });
  }

  private async assembleArticle(
    record: WorkflowRecord,
    units: readonly ProductionUnit[],
    results: readonly ProductionUnitAcceptanceResult[],
  ): Promise<Record<string, unknown>> {
    const contentMaster = await this.contentMasterFor(record.context);
    if (contentMaster.master.carrier !== "article") throw new Error("Article production requires a locked article master.");
    const profile = readPlatformProfile(record.context.articlePlatformProfile);
    const branch = createArticleBranch(record, profile, requireText(record.context.contentMasterArtifactId, "contentMasterArtifactId"));
    const requirements = await this.requirementSetFor(record.context);
    const output = buildArticleAssemblerOutput({
      master: contentMaster.master,
      masterArtifactId: requireText(record.context.contentMasterArtifactId, "contentMasterArtifactId"),
      platformProfile: profile,
      branch,
      acceptedAssets: articleAcceptedAssets(contentMaster.master, requirements, units, results),
      documentId: `article_${record.id}`,
      documentRevision: articleDocumentRevision(record.context),
      createdAt: new Date().toISOString(),
    });
    const documentArtifact = await this.artifacts.write({
      kind: "article_document", content: output.document, parentArtifactIds: artifactIdsFor(record.context), revision: output.document.revision,
    });
    const previewArtifact = await this.artifacts.write({
      kind: "preview", content: output.preview, parentArtifactIds: [documentArtifact.artifactId], revision: output.document.revision,
    });
    const manifestArtifact = await this.artifacts.write({
      kind: "asset_manifest", content: output.assetManifest, parentArtifactIds: [documentArtifact.artifactId], revision: output.document.revision,
    });
    const outputArtifacts = createArticleProductionArtifacts({
      documentArtifact, previewArtifact, assetManifestArtifact: manifestArtifact,
      documentRevision: output.document.revision,
      previewDocumentRevision: output.preview.documentRevision,
      assetManifestDocumentRevision: output.assetManifest.documentRevision,
    });
    return withArtifacts(record.context, [documentArtifact, previewArtifact, manifestArtifact], {
      articleAssemblerReference: output.reference,
      articleProductionArtifacts: outputArtifacts,
      articleDocumentRevision: output.document.revision,
    });
  }

  private async lockAssembledArticle(
    record: WorkflowRecord,
    units: readonly ProductionUnit[],
    lockContext: Record<string, unknown>,
  ): Promise<ProductionLockedCapsule> {
    const artifacts = readArticleProductionArtifacts(record.context.articleProductionArtifacts);
    const reference = readArticleAssemblerReference(record.context.articleAssemblerReference);
    const document = await this.readArtifactContent(artifacts.documentArtifactId, "article_document");
    const manifest = await this.readArtifactContent(artifacts.assetManifestArtifactId, "asset_manifest");
    const gate = getArticleReviewGate({
      units,
      document: document as Parameters<typeof getArticleReviewGate>[0]["document"],
      manifest: manifest as Parameters<typeof getArticleReviewGate>[0]["manifest"],
      previewAccepted: lockContext.previewAccepted === true,
      hardConstraintFailures: readStringArrayOrEmpty(lockContext.hardConstraintFailures, "hardConstraintFailures"),
      semanticDrift: readStringArrayOrEmpty(lockContext.semanticDrift, "semanticDrift"),
    });
    if (!gate.canLock) throw new Error(`Article preview cannot lock: ${gate.blockers.join(" ") || gate.pendingAction?.instruction || "complete preview review is required."}`);
    return {
      state: "PRODUCTION_LOCKED", carrier: "article",
      backend: { kind: "article_assembler", reference },
      outputArtifacts: artifacts,
      lockedAt: new Date().toISOString(),
    };
  }

  private async runVideoBridge(
    record: WorkflowRecord,
    results: readonly ProductionUnitAcceptanceResult[],
  ) {
    const contentMaster = await this.contentMasterFor(record.context);
    const requirementSet = await this.requirementSetFor(record.context);
    if (contentMaster.master.carrier !== "video" || contentMaster.budget.carrier !== "video") {
      throw new Error("Video production requires a locked video master.");
    }
    const input = {
      lockedMaster: {
        topicId: contentMaster.topicId,
        budget: contentMaster.budget,
        master: contentMaster.master,
        confirmedAt: contentMaster.confirmedAt,
      },
      requirementSet,
      acceptedProductionResults: results.map((result) => ({
        unitId: result.unitId,
        artifactIds: result.acceptedArtifactRefs.map((artifact) => artifact.artifactId),
        provenance: result.provenanceNote,
      })),
    };
    if (videoBackendFor(record.context) === "vectcut") {
      return runVectCutBridge(this.vectCutBridge, {
        ...input,
        mediaSources: readVectCutMediaSources(record.context.vectcutMediaSources),
      });
    }
    return runCutWorkbenchBridge(this.cutWorkbenchBridge, input);
  }

  private lockVideoProduction(
    record: WorkflowRecord,
    lockContext: Record<string, unknown>,
  ): ProductionLockedCapsule {
    if (videoBackendFor(record.context) === "vectcut") {
      const result = record.context.vectcutResult as VectCutDraftResult | undefined;
      if (!result || result.kind !== "draft_result") {
        throw new Error("Video production requires a generated VectCut draft before lock.");
      }
      if (lockContext.vectcutDraftAccepted !== true) {
        throw new Error("Locking a VectCut draft requires vectcutDraftAccepted: true after human review.");
      }
      requireText(lockContext.vectcutReviewNote, "vectcutReviewNote");
      const draftArtifactId = requireText(record.context.vectcutDraftArtifactId, "vectcutDraftArtifactId");
      return {
        state: "PRODUCTION_LOCKED", carrier: "video",
        backend: { kind: "vectcut", reference: result.reference },
        outputArtifactIds: [draftArtifactId],
        deliveryMode: "editable_draft",
        lockedAt: new Date().toISOString(),
      };
    }
    const result = record.context.cutWorkbenchResult as CutWorkbenchProductionResult | undefined;
    if (!result || result.kind !== "production_result" || !result.finalGate.passed) {
      throw new Error("Video production requires a configured Cut Workbench result with a passed final gate.");
    }
    if (!result.finalSubtitleArtifactId) throw new Error("Video production requires a final subtitle artifact.");
    return {
      state: "PRODUCTION_LOCKED", carrier: "video",
      backend: { kind: "cut_workbench", reference: { projectId: result.projectId, revision: result.revision } },
      outputArtifactIds: [...new Set([...result.verifiedOutputArtifactIds, result.finalSubtitleArtifactId])],
      deliveryMode: "final_video",
      lockedAt: new Date().toISOString(),
    };
  }

  private async releasePackageDraftFor(context: Record<string, unknown>) {
    const content = await this.readArtifactContent(context.releasePackageDraftArtifactId, "release_package_draft");
    if (!isRecord(content)) throw new Error("Release package draft artifact is invalid.");
    return readReleasePackagingDraft(content.draft);
  }

  private async readArtifactContent(artifactId: unknown, expectedKind: string): Promise<unknown> {
    const artifact = await this.artifacts.read(requireText(artifactId, `${expectedKind} artifact ID`));
    if (artifact.kind !== expectedKind) throw new Error(`${expectedKind} artifact is invalid.`);
    return artifact.content;
  }

  private async toSnapshot(record: WorkflowRecord): Promise<WorkflowSnapshot> {
    const topicMatch = await this.topicMatchFor(record.context);
    const baselineProposal = baselineProposalFor(record.context);
    return {
      workflowId: record.id,
      carrier: record.carrier,
      state: record.state,
      revision: record.revision,
      updatedAt: record.updatedAt,
      summary: record.summary,
      agentWork: agentWorkFor(record.context),
      fetchBrief: fetchBriefFor(record.context),
      topicMatch,
      ...(baselineProposal ? {
        baselineProposal,
        baselineGrillCount: baselineGrillCount(record.context),
      } : {}),
      deliverables: workspaceDeliverablesFor(record.context),
      status: statusFor(record.state),
      artifactRefs: artifactRefsFor(record.context),
      pendingAction: pendingActionForRecord(record),
    };
  }

  private async syncWorkspace(record: WorkflowRecord): Promise<void> {
    if (!this.workspace) return;
    const deliverables = await this.workspace.sync({
      workflowId: record.id,
      carrier: record.carrier,
      state: record.state,
      revision: record.revision,
      summary: record.summary,
      artifactRefs: artifactRefsFor(record.context),
    });
    record.context = { ...record.context, workspaceDeliverables: deliverables };
  }

  private async topicMatchFor(context: Record<string, unknown>): Promise<WorkflowSnapshot["topicMatch"]> {
    const artifactId = context.topicMatchArtifactId;
    if (typeof artifactId !== "string") return undefined;
    const artifact = await this.artifacts.read(artifactId);
    if (artifact.kind !== "topic_match" || !isRecord(artifact.content)) {
      throw new Error("Topic-match artifact is invalid.");
    }
    return artifact.content as unknown as WorkflowSnapshot["topicMatch"];
  }
}

function requireWorkflow(record: WorkflowRecord | undefined, workflowId: string): WorkflowRecord {
  if (!record) {
    throw new Error(`Unknown workflow ${workflowId}. Create one with promo_commit(kind=create_workflow).`);
  }
  return record;
}

function assertRevision(record: WorkflowRecord, expectedRevision: number): void {
  if (record.revision !== expectedRevision) {
    throw new Error(`Revision conflict: expected ${expectedRevision}, current revision is ${record.revision}. Call promo_get and retry.`);
  }
}

function appendEvent(record: WorkflowRecord, kind: WorkflowEventKind, summary: string): void {
  record.events.push({
    id: `evt_${randomUUID()}`,
    kind,
    state: record.state,
    revision: record.revision,
    at: record.updatedAt,
    summary,
  });
}

function pendingActionFor(state: WorkflowState): PendingAction | null {
  switch (state) {
    case "READY":
      return action("prepare_fetch", "run", "生成 Web 抓取任务。需要已配置 productProfile 与 topicSources。");
    case "FETCHING":
      return action("fetch_topics", "agent_work", "按 fetchBrief 使用当前 Agent 的 Web Fetch 或浏览器能力抓取材料卡，再以 kind=submit_fetched_topics 回填。");
    case "MATCHING":
      return action("run_matching", "run", "对已回填的材料卡执行双向匹配与排序。");
    case "AWAITING_SELECTION":
      return action("select_topic", "commit", "从 topicMatch.candidates 中选择一项，以 kind=select_topic 提交 topicId 和 selectedMaterials。");
    case "TOPIC_LOCKED":
      return action("begin_baseline", "run", "生成以读者场景为起点的宣传意图任务。");
    case "ALIGNING_BASELINE":
      return action("align_baseline", "agent_work", "查看决策卡。先提交场景化宣传意图；如有待答问题，提交 answer_baseline_grill 后必须回填一版吸收该决定的修订稿，才能锁定。");
    case "BASELINE_LOCKED":
      return action("begin_outline", "run", "生成 2–3 条场景化创意路线。");
    case "ALIGNING_OUTLINE":
      return action("align_outline", "agent_work", "先提交 2–3 条 creativeRoutes 并选择一条；随后围绕该路线提交大纲。每个已回答 Grill 都必须产出一版修订大纲。");
    case "OUTLINE_LOCKED":
      return action("begin_master", "run", "生成完整主稿/分镜扩写任务。");
    case "ALIGNING_MASTER":
      return action("submit_master_draft", "agent_work", "按 agentWork 提交完整 master 与通过的 review；必要时可逐次 answer_master_grill，确认后 lock_master。");
    case "MASTER_LOCKED":
      return action("compile_requirements", "run", "Compile material requirements.");
    case "REQUIREMENTS_READY":
      return action("begin_production", "run", "Start the carrier-specific production backend.");
    case "PRODUCING":
      return action("update_production_units", "agent_work", "按 agentWork 回填既有制作单元状态；全部 accepted 后以 lock_production 提交后端引用和成品制品 ID。");
    case "PRODUCTION_LOCKED":
      return action("begin_packaging", "run", "Generate the release packaging task.");
    case "PACKAGING":
      return action("submit_release_package", "agent_work", "按 agentWork 提交三标题、两封面与简介/摘要；再以 select_release_package 选择最终组合。");
    case "RELEASE_READY":
      return null;
    case "NEEDS_PROFILE":
    case "GENERATING_CREATIVE":
    case "GENERATING_MASTER":
    case "COMPILING_REQUIREMENTS":
      return action("agent_work", "agent_work", "This transient state is managed internally; call promo_get again after the current action completes.");
  }
}

function pendingActionForRecord(record: WorkflowRecord): PendingAction | null {
  if (record.state === "PRODUCING" && record.carrier === "article" && record.context.articleProductionArtifacts) {
    return action("review_article_preview", "commit", "审阅完整本地文章预览；确认后以 lock_production 提交 previewAccepted: true。任何硬约束或语义漂移需一并回填。");
  }
  if (record.state === "PRODUCING" && record.carrier === "video") {
    if (isRecord(record.context.productionCapabilityGap)) {
      return action("resolve_video_backend", "agent_work", "视频后端未配置或不兼容；按 capability gap 配置桥接，或将需求返回重规划。");
    }
    if (isRecord(record.context.vectcutResult) && record.context.vectcutResult.kind === "draft_result") {
      return action("review_vectcut_draft", "commit", "在 VectCut/剪映中审核可编辑草稿。需要改动时以 update_production_units 回退相关单元并重跑；确认后以 lock_production 提交 vectcutDraftAccepted: true 和 vectcutReviewNote。草稿不是最终导出视频。");
    }
    if (isRecord(record.context.cutWorkbenchResult) && record.context.cutWorkbenchResult.kind === "production_result") {
      if (isRecord(record.context.cutWorkbenchResult.finalGate) && record.context.cutWorkbenchResult.finalGate.passed === true) {
        return action("lock_video_production", "commit", "Cut Workbench 已返回验证结果；以 lock_production 锁定该项目版本和最终字幕。 ");
      }
      return action("continue_cut_workbench_production", "agent_work", "在 Cut Workbench 完成九阶段生产、终剪字幕与交付验证；完成后再次调用 promo_run 同步最终项目版本。");
    }
  }
  return pendingActionFor(record.state);
}

function action(id: string, kind: PendingAction["kind"], instruction: string): PendingAction {
  return { id, kind, instruction };
}

function findIdempotentSnapshot(
  data: { workflows: Record<string, WorkflowRecord> },
  key: string,
): WorkflowSnapshot | undefined {
  for (const workflow of Object.values(data.workflows)) {
    const snapshot = workflow.idempotency[key];
    if (snapshot) {
      return snapshot;
    }
  }
  return undefined;
}

function fetchBriefFor(context: Record<string, unknown>) {
  const value = context.fetchBrief;
  return typeof value === "object" && value !== null ? value as WorkflowSnapshot["fetchBrief"] : undefined;
}

function agentWorkFor(context: Record<string, unknown>) {
  const value = context.agentWork ?? context.fetchBrief;
  return isRecord(value) ? value as unknown as WorkflowSnapshot["agentWork"] : undefined;
}

function artifactRefsFor(context: Record<string, unknown>): ArtifactRef[] {
  const value = context.artifactRefs;
  return Array.isArray(value) ? value.filter(isArtifactRef) : [];
}

function workspaceDeliverablesFor(context: Record<string, unknown>): WorkspaceDeliverableRef[] {
  const value = context.workspaceDeliverables;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is WorkspaceDeliverableRef => isRecord(item)
    && typeof item.artifactId === "string"
    && typeof item.kind === "string"
    && typeof item.path === "string"
    && typeof item.versionPath === "string");
}

function statusFor(state: WorkflowState): WorkflowSnapshot["status"] {
  const status: Record<WorkflowState, WorkflowSnapshot["status"]> = {
    NEEDS_PROFILE: { node: 1, label: "选材", userFacingState: "等待产品卡" },
    READY: { node: 1, label: "选材", userFacingState: "准备抓取" },
    FETCHING: { node: 1, label: "选材", userFacingState: "等待材料卡" },
    MATCHING: { node: 1, label: "选材", userFacingState: "正在匹配" },
    AWAITING_SELECTION: { node: 1, label: "选材", userFacingState: "等待选题" },
    TOPIC_LOCKED: { node: 2, label: "宣传意图", userFacingState: "准备细化" },
    ALIGNING_BASELINE: { node: 2, label: "宣传意图", userFacingState: "场景化对齐中" },
    BASELINE_LOCKED: { node: 3, label: "创意与大纲", userFacingState: "准备提出路线" },
    GENERATING_CREATIVE: { node: 3, label: "创意与大纲", userFacingState: "生成中" },
    ALIGNING_OUTLINE: { node: 3, label: "创意与大纲", userFacingState: "路线选择与场景细化中" },
    OUTLINE_LOCKED: { node: 4, label: "主稿", userFacingState: "准备扩写" },
    GENERATING_MASTER: { node: 4, label: "主稿", userFacingState: "生成中" },
    ALIGNING_MASTER: { node: 4, label: "主稿", userFacingState: "扩写与审校中" },
    MASTER_LOCKED: { node: 5, label: "素材需求", userFacingState: "准备编译" },
    COMPILING_REQUIREMENTS: { node: 5, label: "素材需求", userFacingState: "编译中" },
    REQUIREMENTS_READY: { node: 6, label: "制作", userFacingState: "准备制作" },
    PRODUCING: { node: 6, label: "制作", userFacingState: "制作与审核中" },
    PRODUCTION_LOCKED: { node: 7, label: "发布包装", userFacingState: "准备包装" },
    PACKAGING: { node: 7, label: "发布包装", userFacingState: "标题、封面与简介中" },
    RELEASE_READY: { node: 7, label: "发布包装", userFacingState: "已完成" },
  };
  return status[state];
}

function artifactIdsFor(context: Record<string, unknown>): string[] {
  return artifactRefsFor(context).map((reference) => reference.artifactId);
}

function baselineGrillCount(context: Record<string, unknown>): number {
  const value = context.baselineGrillCount;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function baselineProposalFor(context: Record<string, unknown>) {
  const value = context.baselineProposal;
  if (!isRecord(value)) return undefined;
  try {
    return readBaselineProposal(value);
  } catch {
    return undefined;
  }
}

function outlineGrillCount(context: Record<string, unknown>): number {
  return nonNegativeInteger(context.outlineGrillCount);
}

function masterGrillCount(context: Record<string, unknown>): number {
  return nonNegativeInteger(context.masterGrillCount);
}

function masterGrillCap(budget: ContentBudget): number {
  return budget.tier === "short" ? 2 : budget.tier === "standard" ? 3 : 4;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty text.`);
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireText(value, "text");
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${field} must be a non-empty string array.`);
  return value.map((item, index) => requireText(item, `${field}[${index}]`));
}

function readStringArrayOrEmpty(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be a string array.`);
  return value.map((item, index) => requireText(item, `${field}[${index}]`));
}

function readRouteHints(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("routeHints must be an array.");
  return value.map((hint, index) => {
    if (!isRecord(hint)) throw new Error(`routeHints[${index}] must be an object.`);
    const route = requireText(hint.route, `routeHints[${index}].route`) as "human" | "generative" | "local";
    if (route !== "human" && route !== "generative" && route !== "local") throw new Error(`routeHints[${index}].route is invalid.`);
    return {
      requirementId: requireText(hint.requirementId, `routeHints[${index}].requirementId`),
      route,
      ...(hint.dependencies === undefined ? {} : { dependencies: readStringArrayOrEmpty(hint.dependencies, `routeHints[${index}].dependencies`) }),
      ...(hint.instruction === undefined ? {} : { instruction: requireText(hint.instruction, `routeHints[${index}].instruction`) }),
    };
  });
}

function readSupportedRoutes(value: unknown) {
  if (value === undefined) return undefined;
  const routes = readStringArray(value, "supportedProductionRoutes");
  for (const route of routes) if (route !== "human" && route !== "generative" && route !== "local") throw new Error("supportedProductionRoutes contains an invalid route.");
  return routes as Array<"human" | "generative" | "local">;
}

function readProductionUnits(value: unknown): ProductionUnit[] {
  if (!Array.isArray(value)) throw new Error("units must be an array.");
  return value.map((unit, index) => {
    if (!isRecord(unit)) throw new Error(`units[${index}] must be an object.`);
    const route = requireText(unit.route, `units[${index}].route`);
    const status = requireText(unit.status, `units[${index}].status`);
    if (route !== "human" && route !== "generative" && route !== "local") throw new Error(`units[${index}].route is invalid.`);
    if (!(["queued", "active", "waiting_human", "review", "accepted", "needs_replan"] as string[]).includes(status)) {
      throw new Error(`units[${index}].status is invalid.`);
    }
    return {
      id: requireText(unit.id, `units[${index}].id`),
      requirementIds: readStringArray(unit.requirementIds, `units[${index}].requirementIds`),
      route,
      status,
      dependencies: readStringArrayOrEmpty(unit.dependencies, `units[${index}].dependencies`),
    } as ProductionUnit;
  });
}

function readProductionResults(value: unknown): ProductionUnitAcceptanceResult[] {
  if (!Array.isArray(value)) throw new Error("productionResults must be an array.");
  return value.map((result, index) => {
    if (!isRecord(result)) throw new Error(`productionResults[${index}] must be an object.`);
    if (!Array.isArray(result.acceptedArtifactRefs)) throw new Error(`productionResults[${index}].acceptedArtifactRefs must be an array.`);
    const acceptedArtifactRefs = result.acceptedArtifactRefs.map((artifact, artifactIndex) => {
      if (!isArtifactRef(artifact)) throw new Error(`productionResults[${index}].acceptedArtifactRefs[${artifactIndex}] is invalid.`);
      return artifact;
    });
    return {
      unitId: requireText(result.unitId, `productionResults[${index}].unitId`),
      acceptedArtifactRefs,
      provenanceNote: requireText(result.provenanceNote, `productionResults[${index}].provenanceNote`),
      backendRevision: readPositiveInteger(result.backendRevision, `productionResults[${index}].backendRevision`),
    };
  });
}

function readPlatformProfile(value: unknown): PlatformProfile {
  if (!isRecord(value) || !isRecord(value.renderPreset) || !Array.isArray(value.constraints) || !Array.isArray(value.sources)) {
    throw new Error("Article production requires a complete context.articlePlatformProfile.");
  }
  const renderPreset = value.renderPreset;
  if (renderPreset.mode !== "preview_analogue") throw new Error("Article platform profile must use preview_analogue.");
  return {
    id: requireText(value.id, "articlePlatformProfile.id"),
    platform: requireText(value.platform, "articlePlatformProfile.platform"),
    version: requireText(value.version, "articlePlatformProfile.version"),
    constraints: value.constraints.map((constraint, index) => {
      if (!isRecord(constraint) || (constraint.kind !== "hard" && constraint.kind !== "soft")) throw new Error(`articlePlatformProfile.constraints[${index}] is invalid.`);
      return { id: requireText(constraint.id, `articlePlatformProfile.constraints[${index}].id`), kind: constraint.kind, rule: requireText(constraint.rule, `articlePlatformProfile.constraints[${index}].rule`) };
    }),
    renderPreset: { id: requireText(renderPreset.id, "articlePlatformProfile.renderPreset.id"), mode: "preview_analogue", description: requireText(renderPreset.description, "articlePlatformProfile.renderPreset.description") },
    sources: value.sources.map((source, index) => {
      if (!isRecord(source)) throw new Error(`articlePlatformProfile.sources[${index}] is invalid.`);
      return { reference: requireText(source.reference, `articlePlatformProfile.sources[${index}].reference`), checkedAt: requireText(source.checkedAt, `articlePlatformProfile.sources[${index}].checkedAt`) };
    }),
    updatedAt: requireText(value.updatedAt, "articlePlatformProfile.updatedAt"),
  };
}

function createArticleBranch(record: WorkflowRecord, profile: PlatformProfile, masterArtifactId: string): ArticlePlatformBranch {
  return {
    id: `branch_${record.id}_${profile.platform.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
    parentMasterRevision: masterArtifactId,
    platform: profile.platform,
    platformProfileId: profile.id,
    platformProfileVersion: profile.version,
    createdAt: new Date().toISOString(),
  };
}

function articleAcceptedAssets(
  master: ArticleManuscriptMaster,
  requirements: CompiledRequirementSet,
  units: readonly ProductionUnit[],
  results: readonly ProductionUnitAcceptanceResult[],
): AcceptedArticleAssetResult[] {
  if (requirements.carrier !== "article") throw new Error("Article assembly requires article requirements.");
  const resultByUnit = new Map(results.map((result) => [result.unitId, result]));
  return master.assetPlacements.map((placement) => {
    const requirement = requirements.requirements.find((candidate) => candidate.coverageUsageIds.includes(placement.assetUsageId));
    if (!requirement) throw new Error(`Article placement ${placement.id} has no compiled material requirement.`);
    const unit = units.find((candidate) => candidate.requirementIds.includes(requirement.requirementId));
    const result = unit ? resultByUnit.get(unit.id) : undefined;
    const artifact = result?.acceptedArtifactRefs[0];
    if (!unit || !artifact) throw new Error(`Article placement ${placement.id} has no accepted production result.`);
    return {
      assetUsageId: placement.assetUsageId,
      assetId: `asset_${placement.id}`,
      route: unit.route,
      sourceArtifactIds: [...new Set([artifact.artifactId, ...artifact.parentArtifactIds])],
    };
  });
}

function articleDocumentRevision(context: Record<string, unknown>): number {
  const current = context.articleDocumentRevision;
  return typeof current === "number" && Number.isInteger(current) && current >= 1 ? current + 1 : 1;
}

function readArticleProductionArtifacts(value: unknown): { documentArtifactId: string; previewArtifactId: string; assetManifestArtifactId: string } {
  if (!isRecord(value)) throw new Error("Article production has not generated its preview artifacts yet.");
  return {
    documentArtifactId: requireText(value.documentArtifactId, "articleProductionArtifacts.documentArtifactId"),
    previewArtifactId: requireText(value.previewArtifactId, "articleProductionArtifacts.previewArtifactId"),
    assetManifestArtifactId: requireText(value.assetManifestArtifactId, "articleProductionArtifacts.assetManifestArtifactId"),
  };
}

function readArticleAssemblerReference(value: unknown) {
  if (!isRecord(value)) throw new Error("Article production has no Assembler reference.");
  return {
    branchId: requireText(value.branchId, "articleAssemblerReference.branchId"),
    revision: readPositiveInteger(value.revision, "articleAssemblerReference.revision"),
    parentMasterRevision: requireText(value.parentMasterRevision, "articleAssemblerReference.parentMasterRevision"),
    platform: requireText(value.platform, "articleAssemblerReference.platform"),
    platformProfileId: requireText(value.platformProfileId, "articleAssemblerReference.platformProfileId"),
    platformProfileVersion: requireText(value.platformProfileVersion, "articleAssemblerReference.platformProfileVersion"),
  };
}

function assertProductionUnitUpdate(original: readonly ProductionUnit[], updated: readonly ProductionUnit[]): void {
  if (original.length !== updated.length) throw new Error("Production updates must retain every planned unit.");
  const existing = new Map(original.map((unit) => [unit.id, unit]));
  for (const unit of updated) {
    const expected = existing.get(unit.id);
    if (!expected) throw new Error(`Production update contains unknown unit ${unit.id}.`);
    if (unit.route !== expected.route || unit.requirementIds.join("\n") !== expected.requirementIds.join("\n") || unit.dependencies.join("\n") !== expected.dependencies.join("\n")) {
      throw new Error(`Production update cannot change the route, requirements, or dependencies of ${unit.id}.`);
    }
  }
}

function readLockedProduction(carrier: WorkflowCarrier, value: unknown, lockedAt: string): ProductionLockedCapsule {
  if (!isRecord(value) || !isRecord(value.backend)) throw new Error("production must include backend and output references.");
  const backend = value.backend;
  if (carrier === "video") {
    if ((backend.kind !== "cut_workbench" && backend.kind !== "vectcut") || !isRecord(backend.reference)) throw new Error("Video production requires a configured backend reference.");
    const outputArtifactIds = readStringArray(value.outputArtifactIds, "production.outputArtifactIds");
    const deliveryMode = value.deliveryMode;
    if (deliveryMode !== "final_video" && deliveryMode !== "editable_draft") throw new Error("Video production requires a valid deliveryMode.");
    if (backend.kind === "vectcut") {
      return {
        state: "PRODUCTION_LOCKED", carrier: "video",
        backend: { kind: "vectcut", reference: {
          draftId: requireText(backend.reference.draftId, "production.backend.reference.draftId"),
          draftUrl: backend.reference.draftUrl === null ? null : requireText(backend.reference.draftUrl, "production.backend.reference.draftUrl"),
          revision: readPositiveInteger(backend.reference.revision, "production.backend.reference.revision"),
        } },
        outputArtifactIds, deliveryMode, lockedAt,
      };
    }
    return {
      state: "PRODUCTION_LOCKED", carrier: "video",
      backend: { kind: "cut_workbench", reference: { projectId: requireText(backend.reference.projectId, "production.backend.reference.projectId"), revision: readPositiveInteger(backend.reference.revision, "production.backend.reference.revision") } },
      outputArtifactIds, deliveryMode, lockedAt,
    };
  }
  if (backend.kind !== "article_assembler" || !isRecord(backend.reference) || !isRecord(value.outputArtifacts)) throw new Error("Article production requires Article Assembler references and outputs.");
  const output = value.outputArtifacts;
  return {
    state: "PRODUCTION_LOCKED", carrier: "article",
    backend: { kind: "article_assembler", reference: {
      branchId: requireText(backend.reference.branchId, "production.backend.reference.branchId"),
      revision: readPositiveInteger(backend.reference.revision, "production.backend.reference.revision"),
      parentMasterRevision: requireText(backend.reference.parentMasterRevision, "production.backend.reference.parentMasterRevision"),
      platform: requireText(backend.reference.platform, "production.backend.reference.platform"),
      platformProfileId: requireText(backend.reference.platformProfileId, "production.backend.reference.platformProfileId"),
      platformProfileVersion: requireText(backend.reference.platformProfileVersion, "production.backend.reference.platformProfileVersion"),
    } },
    outputArtifacts: {
      documentArtifactId: requireText(output.documentArtifactId, "production.outputArtifacts.documentArtifactId"),
      previewArtifactId: requireText(output.previewArtifactId, "production.outputArtifacts.previewArtifactId"),
      assetManifestArtifactId: requireText(output.assetManifestArtifactId, "production.outputArtifacts.assetManifestArtifactId"),
    },
    lockedAt,
  };
}

function videoBackendFor(context: Record<string, unknown>): "cut_workbench" | "vectcut" {
  const backend = context.videoBackend;
  if (backend === undefined || backend === "cut_workbench") return "cut_workbench";
  if (backend === "vectcut") return "vectcut";
  throw new Error("videoBackend must be either cut_workbench or vectcut.");
}

function readVectCutMediaSources(value: unknown): VectCutMediaSource[] {
  if (!Array.isArray(value)) throw new Error("VectCut requires context.vectcutMediaSources.");
  return value.map((source, index) => {
    if (!isRecord(source)) throw new Error(`vectcutMediaSources[${index}] must be an object.`);
    const parsed: VectCutMediaSource = {
      usageId: requireText(source.usageId, `vectcutMediaSources[${index}].usageId`),
      videoUrl: requireText(source.videoUrl, `vectcutMediaSources[${index}].videoUrl`),
    };
    if (source.sourceStartSeconds !== undefined) parsed.sourceStartSeconds = readNonNegativeNumber(source.sourceStartSeconds, `vectcutMediaSources[${index}].sourceStartSeconds`);
    if (source.sourceEndSeconds !== undefined) parsed.sourceEndSeconds = readNonNegativeNumber(source.sourceEndSeconds, `vectcutMediaSources[${index}].sourceEndSeconds`);
    return parsed;
  });
}

function readPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer.`);
  return value;
}

function readNonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${field} must be a non-negative number.`);
  return value;
}

function readReleaseEvidenceSources(value: unknown): Array<{ artifactId: string; description: string }> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("releaseEvidenceSources must be an array.");
  return value.map((source, index) => {
    if (!isRecord(source)) throw new Error(`releaseEvidenceSources[${index}] must be an object.`);
    return { artifactId: requireText(source.artifactId, `releaseEvidenceSources[${index}].artifactId`), description: requireText(source.description, `releaseEvidenceSources[${index}].description`) };
  });
}

function readCreativeRoutes(value: unknown): CreativeRoute[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3) {
    throw new Error("creativeRoutes must contain 2-3 routes.");
  }
  const ids = new Set<string>();
  return value.map((route, index) => readCreativeRoute(route, `creativeRoutes[${index}]`, ids));
}

function readCreativeRoute(value: unknown, field: string, ids?: Set<string>): CreativeRoute {
  if (!isRecord(value)) throw new Error(`${field} must be an object.`);
  const id = requireText(value.id, `${field}.id`);
  if (ids?.has(id)) throw new Error(`creativeRoutes contains duplicate id: ${id}.`);
  ids?.add(id);
  return {
    id,
    name: requireText(value.name, `${field}.name`),
    centralTension: requireText(value.centralTension, `${field}.centralTension`),
    openingScene: requireText(value.openingScene, `${field}.openingScene`),
    proofMethod: requireText(value.proofMethod, `${field}.proofMethod`),
    readerShift: requireText(value.readerShift, `${field}.readerShift`),
    whyThisRoute: requireText(value.whyThisRoute, `${field}.whyThisRoute`),
  };
}

function readScenarioDecision(
  context: Record<string, unknown>,
  question: ScenarioGrillQuestion,
  stage: "baseline" | "outline" | "master",
) {
  const questionId = requireText(context.questionId, "questionId");
  if (questionId !== question.id) throw new Error(`Question ${questionId} is not the current ${stage} scenario Grill question.`);
  const answer = requireText(context.answer, "answer");
  return {
    id: `decision_${randomUUID()}`,
    stage,
    question,
    answer,
    answeredAt: new Date().toISOString(),
    requiresRevisionOf: stage === "baseline" ? "campaign-intent" : stage === "outline" ? "creative-outline" : "content-master",
  };
}

function optionalScenarioQuestion(value: unknown, field: string): ScenarioGrillQuestion | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || !Array.isArray(value.options)) throw new Error(`${field} must be a scenario Grill question.`);
  if (value.options.length < 2 || value.options.length > 3) throw new Error(`${field}.options must contain 2-3 items.`);
  const options = value.options.map((option, index) => {
    if (!isRecord(option)) throw new Error(`${field}.options[${index}] must be an object.`);
    return {
      id: requireText(option.id, `${field}.options[${index}].id`),
      label: requireText(option.label, `${field}.options[${index}].label`),
      rationale: requireText(option.rationale, `${field}.options[${index}].rationale`),
    };
  });
  const recommendedOptionId = requireText(value.recommendedOptionId, `${field}.recommendedOptionId`);
  if (!options.some((option) => option.id === recommendedOptionId)) throw new Error(`${field}.recommendedOptionId must identify an option.`);
  return {
    id: requireText(value.id, `${field}.id`),
    scene: requireText(value.scene, `${field}.scene`),
    tension: requireText(value.tension, `${field}.tension`),
    prompt: requireText(value.prompt, `${field}.prompt`),
    options,
    recommendedOptionId,
    affectedDeliverables: readStringArray(value.affectedDeliverables, `${field}.affectedDeliverables`),
  };
}

function unresolvedDecisionIds(context: Record<string, unknown>): string[] {
  return readStringArrayOrEmpty(context.unresolvedDecisionIds, "unresolvedDecisionIds");
}

function assertDecisionsIncorporated(incorporatesDecisionIds: readonly string[], unresolvedIds: readonly string[]): void {
  const missing = unresolvedIds.filter((id) => !incorporatesDecisionIds.includes(id));
  if (missing.length > 0) {
    throw new Error(`The revised deliverable must incorporate pending decisions: ${missing.join(", ")}.`);
  }
}

function assertNoUnresolvedDecisions(context: Record<string, unknown>): void {
  const ids = unresolvedDecisionIds(context);
  if (ids.length > 0) throw new Error(`A revised deliverable is required after decision(s): ${ids.join(", ")}.`);
}

function readMasterReview(value: unknown, carrier: "video" | "article"): MasterReview {
  if (!isRecord(value)) throw new Error("masterReview must be an object.");
  const writingStyle = value.writingStyle;
  if (!isRecord(writingStyle)
    || writingStyle.skill !== "geek-product-promo-writing"
    || writingStyle.scope !== "macro-meso-micro"
    || typeof writingStyle.passed !== "boolean") {
    throw new Error("masterReview.writingStyle must contain an explicit geek-product-promo-writing review.");
  }
  const storyboardValue = value.storyboardDirection;
  const storyboardDirection = storyboardValue === null || storyboardValue === undefined
    ? null
    : readStoryboardReview(storyboardValue);
  if (carrier === "video" && storyboardDirection === null) {
    throw new Error("Video masterReview requires storyboardDirection.");
  }
  const articleEditorial = value.articleEditorial === null || value.articleEditorial === undefined
    ? null
    : readArticleEditorialReview(value.articleEditorial);
  if (carrier === "article" && articleEditorial === null) {
    throw new Error("Article masterReview requires articleEditorial.");
  }
  return {
    passed: value.passed === true,
    evidenceBlockers: readStringArrayOrEmpty(value.evidenceBlockers, "masterReview.evidenceBlockers"),
    writingStyle: {
      skill: "geek-product-promo-writing",
      scope: "macro-meso-micro",
      passed: writingStyle.passed,
      findings: readStringArrayOrEmpty(writingStyle.findings, "masterReview.writingStyle.findings"),
    },
    storyboardDirection,
    articleEditorial,
    assetEfficiencyFindings: readStringArrayOrEmpty(value.assetEfficiencyFindings, "masterReview.assetEfficiencyFindings"),
  };
}

function readArticleEditorialReview(value: unknown): NonNullable<MasterReview["articleEditorial"]> {
  if (!isRecord(value)
    || value.skill !== "appso-product-editor"
    || value.scope !== "human-center-evidence-voice"
    || typeof value.passed !== "boolean") {
    throw new Error("masterReview.articleEditorial must contain an explicit appso-product-editor review.");
  }
  return {
    skill: "appso-product-editor",
    scope: "human-center-evidence-voice",
    passed: value.passed,
    findings: readStringArrayOrEmpty(value.findings, "masterReview.articleEditorial.findings"),
  };
}

function readStoryboardReview(value: unknown): NonNullable<MasterReview["storyboardDirection"]> {
  if (!isRecord(value)
    || value.skill !== "storyboard-direction"
    || value.scope !== "shot-continuity-coverage-assets"
    || typeof value.passed !== "boolean") {
    throw new Error("masterReview.storyboardDirection must be an explicit storyboard-direction review.");
  }
  return {
    skill: "storyboard-direction",
    scope: "shot-continuity-coverage-assets",
    passed: value.passed,
    findings: readStringArrayOrEmpty(value.findings, "masterReview.storyboardDirection.findings"),
  };
}

function createBaselineRevisionBrief(proposal: ReturnType<typeof readBaselineProposal>, decision: Record<string, unknown>, carrier: WorkflowCarrier) {
  return createAgentWorkCapsule({
    stage: "baseline_alignment",
    inputs: { priorProposal: proposal, latestDecision: decision, carrier },
    constraints: [
      "Revise the campaign-intent proposal around the user's answer; do not merely append it as a note.",
      "Keep the reader scene concrete and preserve the locked evidence boundary.",
    ],
    requestedOutput: { description: "A revised campaign-intent proposal that visibly incorporates the answered decision.", fields: ["baselineProposal"] },
    validationRules: ["Set incorporatesDecisionIds to the decision id in latestDecision.", "Submit through promo_commit(kind=propose_baseline)."],
    nextCommitKind: "propose_baseline",
    guidance: createGuidanceRequest(carrier === "article"
      ? ["promo-writing-supervision", "appso-article-contract"]
      : ["promo-writing-supervision"]),
    decisionCard: {
      node: 2, label: "宣传意图修订", known: ["你刚完成一个场景选择。"],
      recommendation: "让这个选择改变表达主次，而不是只换一处措辞。", userDecision: null,
      whyItMatters: "锁定前必须能看见该决定怎样进入传播核心。", nextArtifact: "02-campaign-intent/campaign-intent.json",
    },
    deliverable: { name: "revised campaign intent", workspaceFile: "02-campaign-intent/campaign-intent.json", purpose: "反映用户答案的可复用宣传意图。" },
  });
}

function assertArticleEditorialIntent(carrier: WorkflowCarrier, proposal: ReturnType<typeof readBaselineProposal>): void {
  if (carrier === "article" && !proposal.articleEditorialIntent) {
    throw new Error("Article baseline requires articleEditorialIntent before it can be proposed or locked.");
  }
}

function createMasterRevisionBrief(
  creativeOutline: LockedCreativeOutline,
  priorMaster: ContentMaster,
  decision: Record<string, unknown>,
) {
  return createAgentWorkCapsule({
    stage: "master_development",
    inputs: { creativeOutline, priorMaster, latestDecision: decision },
    constraints: ["Revise the complete master along the answered scenario decision.", "Run the explicit writing review again before resubmission."],
    requestedOutput: { description: "A revised complete master and explicit review trace.", fields: ["masterDraft", "masterReview", "incorporatesDecisionIds"] },
    validationRules: ["Set incorporatesDecisionIds to the decision id in latestDecision.", "Submit through promo_commit(kind=submit_master_draft)."],
    nextCommitKind: "submit_master_draft",
    guidance: createGuidanceRequest(creativeOutline.outline.carrier === "article"
      ? ["promo-writing-supervision", "appso-manuscript-proof", "appso-visual-proof"]
      : ["promo-writing-supervision", "promo-storyboard-supervision", "product-voiceover-campaign", "promo-deliverable-exemplars"]),
    decisionCard: {
      node: 4, label: "主稿修订", known: ["一个阻塞性场景选择已确认。"],
      recommendation: "让选择影响正文/分镜的段落推进与证据，而不是局部补丁。", userDecision: null,
      whyItMatters: "主稿必须保留可追溯的决策链与重新审校记录。", nextArtifact: "04-master/master-draft.json",
    },
    deliverable: { name: "revised master", workspaceFile: "04-master/master-draft.json", purpose: "可继续制作的完整成稿或分镜。" },
  });
}

function toMasterAssetUsages(master: ContentMaster): MasterAssetUsage[] {
  const sources = new Map(master.assetPlan.sourceAssets.map((source) => [source.id, source]));
  const seenVideoShots = new Set<string>();
  const videoShots = master.carrier === "video" ? new Map(master.shots.map((shot) => [shot.id, shot])) : new Map();
  return master.assetPlan.usages.map((usage) => {
    const source = sources.get(usage.sourceAssetId);
    if (!source) throw new Error(`Master asset usage ${usage.id} has no source asset.`);
    const shot = master.carrier === "video" ? videoShots.get(usage.targetId) : undefined;
    const includeSpeech = shot && !seenVideoShots.has(shot.id);
    if (shot) seenVideoShots.add(shot.id);
    return {
      usageId: usage.id,
      sourceAssetId: usage.sourceAssetId,
      materialType: source.productionIntent,
      purpose: usage.purpose,
      ...(usage.fragmentId === null ? {} : { fragmentId: usage.fragmentId }),
      constraints: [...source.constraints],
      ...(shot ? { startMs: shot.timeRange.startMs, endMs: shot.timeRange.endMs } : {}),
      ...(includeSpeech && shot?.spokenContent ? { spokenText: shot.spokenContent } : {}),
      ...(source.essentialOneOffReason ? { oneOffJustification: source.essentialOneOffReason } : {}),
    };
  });
}

function withArtifact(context: Record<string, unknown>, artifact: ArtifactRef, additions: Record<string, unknown>): Record<string, unknown> {
  return {
    ...context,
    ...additions,
    artifactRefs: [...artifactRefsFor(context), artifact],
  };
}

function withArtifacts(context: Record<string, unknown>, artifacts: readonly ArtifactRef[], additions: Record<string, unknown>): Record<string, unknown> {
  return {
    ...context,
    ...additions,
    artifactRefs: [...artifactRefsFor(context), ...artifacts],
  };
}

function without(context: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const next = { ...context };
  for (const key of keys) delete next[key];
  return next;
}

function isArtifactRef(value: unknown): value is ArtifactRef {
  return isRecord(value)
    && typeof value.artifactId === "string"
    && typeof value.kind === "string"
    && typeof value.mediaType === "string"
    && typeof value.contentHash === "string"
    && typeof value.revision === "number"
    && typeof value.createdAt === "string"
    && Array.isArray(value.parentArtifactIds);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
