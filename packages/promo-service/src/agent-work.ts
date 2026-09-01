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
  guidance?: GuidanceRequest | undefined;
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
    ...(input.guidance ? { guidance: input.guidance } : {}),
  };
}
