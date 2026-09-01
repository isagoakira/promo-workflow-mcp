import { createAgentWorkCapsule, type AgentWorkCapsule } from "./agent-work.js";
import type { TopicCandidate } from "./selection/types.js";

export interface BaselineProposal {
  coreMessage: string;
  guidanceIntent: string;
  pendingQuestion?: string | undefined;
  recommendedAnswer?: string | undefined;
}

export interface CreateBaselineBriefInput {
  topic: TopicCandidate;
  productProfile: unknown;
  selectedMaterials: unknown;
}

export function createBaselineBrief(input: CreateBaselineBriefInput): AgentWorkCapsule {
  return createAgentWorkCapsule({
    stage: "baseline_alignment",
    inputs: {
      topic: input.topic,
      selectedMaterials: input.selectedMaterials,
      productProfile: input.productProfile,
    },
    constraints: [
      "Preserve the selected topic's source and evidence boundary.",
      "Propose one remembered idea and one user-facing guidance intent.",
      "Ask at most one consequential unresolved question at a time.",
    ],
    requestedOutput: {
      description: "A baseline proposal with one optional, high-impact Grill question.",
      fields: ["coreMessage", "guidanceIntent", "pendingQuestion", "recommendedAnswer"],
    },
    validationRules: [
      "coreMessage and guidanceIntent must both be non-empty before lock.",
      "The question may concern only positioning, user intent, evidence boundary, or promotional temperature.",
      "Submit a proposal through promo_commit(kind=propose_baseline).",
    ],
    nextCommitKind: "propose_baseline",
  });
}

export function readBaselineProposal(value: unknown): BaselineProposal {
  if (!isRecord(value)) throw new Error("Baseline proposal is required.");
  const pendingQuestion = optionalText(value.pendingQuestion, "baselineProposal.pendingQuestion");
  const recommendedAnswer = optionalText(value.recommendedAnswer, "baselineProposal.recommendedAnswer");
  if (Boolean(pendingQuestion) !== Boolean(recommendedAnswer)) {
    throw new Error("A baseline Grill question requires its recommended answer.");
  }
  return {
    coreMessage: requiredText(value.coreMessage, "baselineProposal.coreMessage"),
    guidanceIntent: requiredText(value.guidanceIntent, "baselineProposal.guidanceIntent"),
    pendingQuestion,
    recommendedAnswer,
  };
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty text.`);
  return value.trim();
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredText(value, field);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
