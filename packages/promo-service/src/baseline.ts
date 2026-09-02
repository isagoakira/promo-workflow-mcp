import type { ArticleEditorialIntent, CampaignIntentCard, ScenarioGrillQuestion } from "@promo-workflow/contracts";
import { createAgentWorkCapsule, createGuidanceRequest, type AgentWorkCapsule } from "./agent-work.js";
import type { TopicCandidate } from "./selection/types.js";

export interface BaselineProposal {
  coreMessage: string;
  guidanceIntent: string;
  campaignIntent: CampaignIntentCard;
  articleEditorialIntent?: ArticleEditorialIntent | undefined;
  pendingQuestion?: ScenarioGrillQuestion | undefined;
  incorporatesDecisionIds: readonly string[];
}

export interface CreateBaselineBriefInput {
  carrier: "video" | "article";
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
      carrier: input.carrier,
      productProfile: input.productProfile,
    },
    constraints: [
      "Preserve the selected topic's source and evidence boundary.",
      "Start from one concrete reader scene, then state the immediate gain before the long-term value.",
      "Propose one remembered idea, one user-facing guidance intent, and one campaign-intent card.",
      "Ask at most one consequential unresolved question at a time.",
      ...(input.carrier === "article" ? ["Lock an articleEditorialIntent with readerDecision, humanCenter, authorStance, warmThread, emotionalArc, and evidencePosture. Every field must be source-supported or honestly framed as an editorial choice, never a fabricated memory."] : []),
    ],
    requestedOutput: {
      description: "A campaign-intent proposal rooted in a reader scene, with one optional high-impact scenario Grill question.",
      fields: input.carrier === "article"
        ? ["coreMessage", "guidanceIntent", "campaignIntent", "articleEditorialIntent", "pendingQuestion", "incorporatesDecisionIds"]
        : ["coreMessage", "guidanceIntent", "campaignIntent", "pendingQuestion", "incorporatesDecisionIds"],
    },
    validationRules: [
      "coreMessage, guidanceIntent, and every campaignIntent field must be non-empty before lock.",
      ...(input.carrier === "article" ? ["articleEditorialIntent must contain all six editorial fields before lock."] : []),
      "A Grill question must name a scene, a tension, 2-3 options, one recommendation, and the deliverables it will change.",
      "Submit a proposal through promo_commit(kind=propose_baseline).",
    ],
    nextCommitKind: "propose_baseline",
    guidance: createGuidanceRequest(input.carrier === "article"
      ? ["promo-writing-supervision", "appso-article-contract"]
      : ["promo-writing-supervision"]),
    decisionCard: {
      node: 2,
      label: "宣传核心与用户引导",
      known: ["选题及证据边界已锁定。"],
      recommendation: "先把读者此刻的具体麻烦说透，再决定产品如何介入。",
      userDecision: "只回答一个会改变整篇表达基调的场景选择。",
      whyItMatters: "它会决定后续创意主线、证据安排和 CTA 的方向。",
      nextArtifact: "02-campaign-intent/campaign-intent.json",
    },
    deliverable: {
      name: "campaign intent",
      workspaceFile: "02-campaign-intent/campaign-intent.json",
      purpose: "供创意、成稿和后续 Agent 复用的已确认宣传意图。",
    },
  });
}

export function readBaselineProposal(value: unknown): BaselineProposal {
  if (!isRecord(value)) throw new Error("Baseline proposal is required.");
  return {
    coreMessage: requiredText(value.coreMessage, "baselineProposal.coreMessage"),
    guidanceIntent: requiredText(value.guidanceIntent, "baselineProposal.guidanceIntent"),
    campaignIntent: readCampaignIntent(value.campaignIntent),
    ...(value.articleEditorialIntent === undefined ? {} : { articleEditorialIntent: readArticleEditorialIntent(value.articleEditorialIntent) }),
    ...(value.pendingQuestion === undefined ? {} : { pendingQuestion: readScenarioQuestion(value.pendingQuestion) }),
    incorporatesDecisionIds: readTextArray(value.incorporatesDecisionIds, "baselineProposal.incorporatesDecisionIds"),
  };
}

function readArticleEditorialIntent(value: unknown): ArticleEditorialIntent {
  if (!isRecord(value)) throw new Error("baselineProposal.articleEditorialIntent is required.");
  return {
    readerDecision: requiredText(value.readerDecision, "articleEditorialIntent.readerDecision"),
    humanCenter: requiredText(value.humanCenter, "articleEditorialIntent.humanCenter"),
    authorStance: requiredText(value.authorStance, "articleEditorialIntent.authorStance"),
    warmThread: requiredText(value.warmThread, "articleEditorialIntent.warmThread"),
    emotionalArc: requiredText(value.emotionalArc, "articleEditorialIntent.emotionalArc"),
    evidencePosture: requiredText(value.evidencePosture, "articleEditorialIntent.evidencePosture"),
  };
}

function readCampaignIntent(value: unknown): CampaignIntentCard {
  if (!isRecord(value)) throw new Error("baselineProposal.campaignIntent is required.");
  return {
    audienceMoment: requiredText(value.audienceMoment, "campaignIntent.audienceMoment"),
    immediateBenefit: requiredText(value.immediateBenefit, "campaignIntent.immediateBenefit"),
    longTermBenefit: requiredText(value.longTermBenefit, "campaignIntent.longTermBenefit"),
    beliefToChange: requiredText(value.beliefToChange, "campaignIntent.beliefToChange"),
    proofToShow: requiredText(value.proofToShow, "campaignIntent.proofToShow"),
    evidenceBoundary: requiredText(value.evidenceBoundary, "campaignIntent.evidenceBoundary"),
    narratorPosition: requiredText(value.narratorPosition, "campaignIntent.narratorPosition"),
    promotionalTemperature: requiredText(value.promotionalTemperature, "campaignIntent.promotionalTemperature"),
    primaryCallToAction: requiredText(value.primaryCallToAction, "campaignIntent.primaryCallToAction"),
    avoid: readTextArray(value.avoid, "campaignIntent.avoid"),
  };
}

function readScenarioQuestion(value: unknown): ScenarioGrillQuestion {
  if (!isRecord(value)) throw new Error("baselineProposal.pendingQuestion must be an object.");
  const optionsValue = value.options;
  if (!Array.isArray(optionsValue) || optionsValue.length < 2 || optionsValue.length > 3) {
    throw new Error("Scenario Grill requires 2-3 options.");
  }
  const options = optionsValue.map((option, index) => {
    if (!isRecord(option)) throw new Error(`pendingQuestion.options[${index}] must be an object.`);
    return {
      id: requiredText(option.id, `pendingQuestion.options[${index}].id`),
      label: requiredText(option.label, `pendingQuestion.options[${index}].label`),
      rationale: requiredText(option.rationale, `pendingQuestion.options[${index}].rationale`),
    };
  });
  const recommendedOptionId = requiredText(value.recommendedOptionId, "pendingQuestion.recommendedOptionId");
  if (!options.some((option) => option.id === recommendedOptionId)) {
    throw new Error("pendingQuestion.recommendedOptionId must identify an option.");
  }
  return {
    id: requiredText(value.id, "pendingQuestion.id"),
    scene: requiredText(value.scene, "pendingQuestion.scene"),
    tension: requiredText(value.tension, "pendingQuestion.tension"),
    prompt: requiredText(value.prompt, "pendingQuestion.prompt"),
    options,
    recommendedOptionId,
    affectedDeliverables: readTextArray(value.affectedDeliverables, "pendingQuestion.affectedDeliverables"),
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

function readTextArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  return value.map((item, index) => requiredText(item, `${field}[${index}]`));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
