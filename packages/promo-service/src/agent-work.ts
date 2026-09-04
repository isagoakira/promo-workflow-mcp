import { randomUUID } from "node:crypto";

export type AgentWorkStage =
  | "workspace_intake"
  | "topic_fetch"
  | "baseline_alignment"
  | "creative_outline"
  | "master_development"
  | "production"
  | "release_packaging";

export interface AgentWorkCapsule {
  taskId: string;
  stage: AgentWorkStage;
  inputs: Record<string, unknown>;
  constraints: string[];
  requestedOutput: {
    description: string;
    fields: string[];
  };
  validationRules: string[];
  nextCommitKind: string;
  decisionCard?: DecisionCard | undefined;
  deliverable?: DeliverableTarget | undefined;
  guidance?: GuidanceRequest | undefined;
}

/** The human-facing part of a state-machine node. Keep this short and actionable. */
export interface DecisionCard {
  node: number;
  label: string;
  known: string[];
  recommendation: string;
  userDecision: string | null;
  whyItMatters: string;
  nextArtifact: string;
}

export interface DeliverableTarget {
  name: string;
  workspaceFile: string;
  purpose: string;
}

export const GUIDANCE_IDS = [
  "human-language-writing",
  "promo-writing-supervision",
  "product-tweet-article-contract",
  "product-tweet-human-center-outline",
  "product-tweet-manuscript-proof",
  "product-tweet-visual-proof",
  "product-tweet-preview-review",
  "product-tweet-release-packaging",
  "promo-storyboard-supervision",
  "product-voiceover-campaign",
  "promo-deliverable-exemplars",
] as const;

export type GuidanceId = (typeof GUIDANCE_IDS)[number];

/** A host-installable package that supplies the focused Skill for this guide. */
export type GuidancePluginId =
  | "promo-human-language-writing"
  | "promo-product-writing"
  | "promo-product-tweet-editor"
  | "promo-video-preproduction";

export type GuidancePriority = "high" | "normal";

export interface GuidancePolicy {
  id: GuidanceId;
  plugin: GuidancePluginId;
  priority: GuidancePriority;
  overview: string;
  loadWhen: string;
}

/**
 * A compact routing contract.  It deliberately contains no long prompt: the
 * Agent calls promo_guidance with the current workflow id to load the full,
 * MCP-owned instructions for the listed guides.
 */
export interface GuidanceRequest {
  router: "promo_guidance";
  policies: GuidancePolicy[];
}

export interface CreateAgentWorkCapsuleInput {
  stage: AgentWorkStage;
  inputs: Record<string, unknown>;
  constraints: string[];
  requestedOutput: AgentWorkCapsule["requestedOutput"];
  validationRules: string[];
  nextCommitKind: string;
  decisionCard?: DecisionCard | undefined;
  deliverable?: DeliverableTarget | undefined;
  guidance?: GuidanceRequest | undefined;
}

export function createAgentWorkCapsule(input: CreateAgentWorkCapsuleInput): AgentWorkCapsule {
  const requestedGuides = input.guidance?.policies.map((policy) => policy.id) ?? [];
  return {
    taskId: `agent_${randomUUID()}`,
    stage: input.stage,
    inputs: input.inputs,
    constraints: input.constraints,
    requestedOutput: input.requestedOutput,
    validationRules: input.validationRules,
    nextCommitKind: input.nextCommitKind,
    ...(input.decisionCard ? { decisionCard: input.decisionCard } : {}),
    ...(input.deliverable ? { deliverable: input.deliverable } : {}),
    guidance: createGuidanceRequest(requestedGuides),
  };
}

export function createGuidanceRequest(ids: readonly GuidanceId[] = []): GuidanceRequest {
  const policies = uniqueGuidanceIds(ids).map(toPolicy);
  return {
    router: "promo_guidance",
    policies: policies.sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority)),
  };
}

function priorityRank(priority: GuidancePriority): number {
  return priority === "high" ? 0 : 1;
}

function uniqueGuidanceIds(ids: readonly GuidanceId[]): GuidanceId[] {
  return [...new Set(ids)];
}

function toPolicy(id: GuidanceId): GuidancePolicy {
  switch (id) {
    case "human-language-writing":
      return { id, plugin: "promo-human-language-writing", priority: "high", overview: "先找回具体的人、处境、细节和判断，再修复四类 AI 八股；不凭空增加事实。", loadWhen: "所有中文宣发的宣传意图、创意大纲、口播/推文主稿、标题简介与修订。" };
    case "promo-writing-supervision":
      return { id, plugin: "promo-product-writing", priority: "normal", overview: "以具体任务和可验证证据组织技术产品表达，避免功能说明书式宣传。", loadWhen: "宣传意图、创意大纲、文章/口播主稿、标题与简介。" };
    case "product-tweet-article-contract":
      return { id, plugin: "promo-product-tweet-editor", priority: "normal", overview: "把 APPSO 文风控制胶囊的稳定部分锁进文章契约：编辑目光、叙述人格、读者关系、温度主线、情绪动线和事实边界。", loadWhen: "仅推文 N2：宣传核心与用户引导。" };
    case "product-tweet-human-center-outline":
      return { id, plugin: "promo-product-tweet-editor", priority: "normal", overview: "选择一个主导类型，把编辑意图展开为注意力动线、比例带、段落职责、转场和视觉证明。", loadWhen: "仅推文 N3：创意路线与文章大纲。" };
    case "product-tweet-manuscript-proof":
      return { id, plugin: "promo-product-tweet-editor", priority: "normal", overview: "按宏观选材、中观段落、微观句子迁移 APPSO 整体风格；作者温度优先，量化只作比例适当的可选证据。", loadWhen: "仅推文 N4：文章主稿与主稿审校。" };
    case "product-tweet-visual-proof":
      return { id, plugin: "promo-product-tweet-editor", priority: "normal", overview: "让截图、录屏和图示紧邻其证明的判断；真实界面和结果不能用装饰性图替代。", loadWhen: "仅推文 N4 素材规划与 N6 素材制作。" };
    case "product-tweet-preview-review":
      return { id, plugin: "promo-product-tweet-editor", priority: "normal", overview: "在本地预览中从编辑目光到外层包装逐层检查方法相似度，并把漂移回流到最早出错的节点。", loadWhen: "仅推文 N6：本地预览审核。" };
    case "product-tweet-release-packaging":
      return { id, plugin: "promo-product-tweet-editor", priority: "normal", overview: "让标题、摘要和封面语压缩正文已经建立的编辑目光、可见条件、读者决定与余味，不新增命题。", loadWhen: "仅推文 N7：标题、封面与摘要。" };
    case "promo-storyboard-supervision":
      return { id, plugin: "promo-video-preproduction", priority: "normal", overview: "检查分镜的时序、视听协作、连续性、覆盖度与素材复用。", loadWhen: "视频主稿、分镜修订与视频审校。" };
    case "product-voiceover-campaign":
      return { id, plugin: "promo-video-preproduction", priority: "normal", overview: "将产品能力转化为可证明、可拍摄的实测故事，并明确口播与画面证据如何协作。", loadWhen: "视频创意、口播主稿、截图证据链与素材缺口规划。" };
    case "promo-deliverable-exemplars":
      return { id, plugin: "promo-video-preproduction", priority: "normal", overview: "读取完整视频前期交付模板契约及其结构卡；固定制品章节、字段粒度、追踪关系和验收，不泛化具体案例事实。", loadWhen: "视频创意路线、分镜主稿与前期素材执行包；先读完整模板，再处理单项结构卡。" };
  }
}
