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

/** Optional guidance only: the MCP service stays usable when the plugin is absent. */
export interface GuidanceRequest {
  plugin: "promo-workflow-guidance";
  skills: string[];
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
    ...(input.guidance ? { guidance: input.guidance } : {}),
  };
}
