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
  "promo-writing-supervision",
  "appso-article-contract",
  "appso-human-center-outline",
  "appso-manuscript-proof",
  "appso-visual-proof",
  "appso-preview-review",
  "appso-release-packaging",
  "promo-storyboard-supervision",
  "product-voiceover-campaign",
  "promo-deliverable-exemplars",
] as const;

export type GuidanceId = (typeof GUIDANCE_IDS)[number];

/** A host-installable package that supplies the focused Skill for this guide. */
export type GuidancePluginId =
  | "promo-product-writing"
  | "promo-article-appso"
  | "promo-video-preproduction";

export interface GuidancePolicy {
  id: GuidanceId;
  plugin: GuidancePluginId;
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
  return {
    router: "promo_guidance",
    policies: uniqueGuidanceIds(ids).map(toPolicy),
  };
}

function uniqueGuidanceIds(ids: readonly GuidanceId[]): GuidanceId[] {
  return [...new Set(ids)];
}

function toPolicy(id: GuidanceId): GuidancePolicy {
  switch (id) {
    case "promo-writing-supervision":
      return { id, plugin: "promo-product-writing", overview: "以具体任务和可验证证据组织技术产品表达，避免功能说明书式宣传。", loadWhen: "宣传意图、创意大纲、文章/口播主稿、标题与简介。" };
    case "appso-article-contract":
      return { id, plugin: "promo-article-appso", overview: "锁定读者决定、人文中心、作者立场、贯穿线、情绪弧和证据姿态；不以虚构经历制造温度。", loadWhen: "仅推文 N2：宣传核心与用户引导。" };
    case "appso-human-center-outline":
      return { id, plugin: "promo-article-appso", overview: "以人文中心和作者立场选择文章路线，安排段落职责、情绪推进、开场和标题方向。", loadWhen: "仅推文 N3：创意路线与文章大纲。" };
    case "appso-manuscript-proof":
      return { id, plugin: "promo-article-appso", overview: "把已锁定的编辑意图扩写为有作者在场感、证据比例适当且不失真的完整推文。", loadWhen: "仅推文 N4：文章主稿与主稿审校。" };
    case "appso-visual-proof":
      return { id, plugin: "promo-article-appso", overview: "让截图、录屏和图示紧邻其证明的判断；真实界面和结果不能用装饰性图替代。", loadWhen: "仅推文 N4 素材规划与 N6 素材制作。" };
    case "appso-preview-review":
      return { id, plugin: "promo-article-appso", overview: "在本地预览中检查锚点、视觉证明、段落推进和作者声音是否在排版后仍成立。", loadWhen: "仅推文 N6：本地预览审核。" };
    case "appso-release-packaging":
      return { id, plugin: "promo-article-appso", overview: "让标题、摘要和封面语兑现正文已经建立的判断，并留下克制而有依据的余味。", loadWhen: "仅推文 N7：标题、封面与摘要。" };
    case "promo-storyboard-supervision":
      return { id, plugin: "promo-video-preproduction", overview: "检查分镜的时序、视听协作、连续性、覆盖度与素材复用。", loadWhen: "视频主稿、分镜修订与视频审校。" };
    case "product-voiceover-campaign":
      return { id, plugin: "promo-video-preproduction", overview: "将产品能力转化为可证明、可拍摄的实测故事，并明确口播与画面证据如何协作。", loadWhen: "视频创意、口播主稿、截图证据链与素材缺口规划。" };
    case "promo-deliverable-exemplars":
      return { id, plugin: "promo-video-preproduction", overview: "读取完整视频前期交付模板契约及其结构卡；固定制品章节、字段粒度、追踪关系和验收，不泛化具体案例事实。", loadWhen: "视频创意路线、分镜主稿与前期素材执行包；先读完整模板，再处理单项结构卡。" };
  }
}
