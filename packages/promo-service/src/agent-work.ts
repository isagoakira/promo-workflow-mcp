import { randomUUID } from "node:crypto";

export type AgentWorkStage =
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
  "promo-workflow-orchestration",
  "promo-writing-supervision",
  "promo-storyboard-supervision",
] as const;

export type GuidanceId = (typeof GUIDANCE_IDS)[number];

export interface GuidancePolicy {
  id: GuidanceId;
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
  plugin: "promo-workflow-guidance";
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
    policies: uniqueGuidanceIds(["promo-workflow-orchestration", ...ids]).map(toPolicy),
    plugin: "promo-workflow-guidance",
  };
}

function uniqueGuidanceIds(ids: readonly GuidanceId[]): GuidanceId[] {
  return [...new Set(ids)];
}

function toPolicy(id: GuidanceId): GuidancePolicy {
  switch (id) {
    case "promo-workflow-orchestration":
      return { id, overview: "按当前节点、制品与版本推进；不得跳过确认或覆盖既有制品。", loadWhen: "每次处理 agentWork 前。" };
    case "promo-writing-supervision":
      return { id, overview: "以具体任务和可验证证据组织技术产品表达，避免功能说明书式宣传。", loadWhen: "宣传意图、创意大纲、文章/口播主稿、标题与简介。" };
    case "promo-storyboard-supervision":
      return { id, overview: "检查分镜的时序、视听协作、连续性、覆盖度与素材复用。", loadWhen: "视频主稿、分镜修订与视频审校。" };
  }
}
