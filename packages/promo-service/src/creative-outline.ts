import {
  STORY_ENGINE_SUGGESTIONS,
  type ArticleOutline,
  type ArticleOutlineSection,
  type CarrierOutline,
  type ContentBudget,
  type CreativeSpine,
  type MacroStyleFrame,
  type MacroStyleReview,
  type PositioningBaseline,
  type VideoOutline,
  type VideoOutlineSegment,
} from "@promo-workflow/contracts";

import { createAgentWorkCapsule, type AgentWorkCapsule } from "./agent-work.js";

export interface CreateCreativeOutlineBriefInput {
  topicId: string;
  baseline: PositioningBaseline;
  selectedMaterials: readonly string[];
  productProfile: unknown;
  budget: ContentBudget;
  recommendedStoryEngine?: string | undefined;
}

export interface CreativeOutlineDraft {
  creativeSpine: CreativeSpine;
  outline: CarrierOutline;
  macroStyleReview: MacroStyleReview;
}

/**
 * The upper end of the agreed question range is the hard Grill cap.  This is
 * deliberately a pure calculation: the state machine owns the count.
 */
export function getOutlineGrillCap(budget: ContentBudget): number {
  return Math.min(6, budget.targetGrillQuestionRange[1]);
}

export function canAskOutlineGrillQuestion(answeredQuestionCount: number, budget: ContentBudget): boolean {
  assertQuestionCount(answeredQuestionCount);
  return answeredQuestionCount < getOutlineGrillCap(budget);
}

export function assertOutlineGrillCapacity(answeredQuestionCount: number, budget: ContentBudget): void {
  if (!canAskOutlineGrillQuestion(answeredQuestionCount, budget)) {
    throw new Error(`Outline Grill limit reached (${getOutlineGrillCap(budget)} questions).`);
  }
}

export function createCreativeOutlineBrief(input: CreateCreativeOutlineBriefInput): AgentWorkCapsule {
  const recommendedStoryEngine = requiredText(
    input.recommendedStoryEngine ?? STORY_ENGINE_SUGGESTIONS[0],
    "recommendedStoryEngine",
  );

  return createAgentWorkCapsule({
    stage: "creative_outline",
    inputs: {
      topicId: requiredText(input.topicId, "topicId"),
      baseline: input.baseline,
      selectedMaterials: [...input.selectedMaterials],
      productProfile: input.productProfile,
      budget: input.budget,
      recommendedStoryEngine,
    },
    constraints: [
      "Create one cross-media creative spine before adapting it to the requested carrier.",
      "Use the locked baseline and selected materials as the evidence boundary; list unsupported claims explicitly.",
      `Use ${input.budget.carrier} ${input.budget.tier} budget: ${input.budget.beatRange[0]}-${input.budget.beatRange[1]} beats.`,
      input.budget.carrier === "video"
        ? `Video segment durations must total exactly ${input.budget.targetDurationSeconds} seconds.`
        : "Every article section needs a distinct sectionPurpose and non-empty content.",
      "Apply geek-product-promo-writing at macro level only; do not write the finished manuscript or shot-by-shot script.",
      "Ask at most one consequential Grill question at a time, and only when it can change multiple beats or the evidence strategy.",
    ],
    requestedOutput: {
      description: "One creative spine, one carrier-specific outline, and a macro-style review.",
      fields: ["creativeSpine", "outline", "macroStyleReview"],
    },
    validationRules: [
      "All creative-spine and macro-style fields must be non-empty.",
      "Video beat count and final edited duration must match the supplied budget.",
      "Article beat count must match the supplied budget; section ids and purposes must be unique.",
      "Submit through promo_commit(kind=submit_outline_draft).",
    ],
    nextCommitKind: "submit_outline_draft",
    guidance: { plugin: "promo-workflow-guidance", skills: ["promo-writing-supervision"] },
  });
}

/** Parses unknown Agent output into the shared contract and rejects invalid structure. */
export function readCreativeOutlineDraft(value: unknown, budget: ContentBudget): CreativeOutlineDraft {
  if (!isRecord(value)) throw new Error("Outline draft is required.");

  const creativeSpine = readCreativeSpine(value.creativeSpine);
  const outline = readCarrierOutline(value.outline, budget);
  const macroStyleReview = readMacroStyleReview(value.macroStyleReview);

  return { creativeSpine, outline, macroStyleReview };
}

function readCreativeSpine(value: unknown): CreativeSpine {
  if (!isRecord(value)) throw new Error("creativeSpine is required.");
  return {
    creativePremise: requiredText(value.creativePremise, "creativeSpine.creativePremise"),
    storyEngine: requiredText(value.storyEngine, "creativeSpine.storyEngine"),
    narrativeAnchor: requiredText(value.narrativeAnchor, "creativeSpine.narrativeAnchor"),
    openingMove: requiredText(value.openingMove, "creativeSpine.openingMove"),
    progression: requiredText(value.progression, "creativeSpine.progression"),
    proofPlan: requiredText(value.proofPlan, "creativeSpine.proofPlan"),
    endingMove: requiredText(value.endingMove, "creativeSpine.endingMove"),
    macroStyle: readMacroStyleFrame(value.macroStyle),
  };
}

function readMacroStyleFrame(value: unknown): MacroStyleFrame {
  if (!isRecord(value)) throw new Error("creativeSpine.macroStyle is required.");
  return {
    speakerPosition: requiredText(value.speakerPosition, "creativeSpine.macroStyle.speakerPosition"),
    readerRelationship: requiredText(value.readerRelationship, "creativeSpine.macroStyle.readerRelationship"),
    promotionalTemperature: requiredText(value.promotionalTemperature, "creativeSpine.macroStyle.promotionalTemperature"),
    technicalDepth: requiredText(value.technicalDepth, "creativeSpine.macroStyle.technicalDepth"),
    emotionalArc: requiredText(value.emotionalArc, "creativeSpine.macroStyle.emotionalArc"),
    endingAltitude: requiredText(value.endingAltitude, "creativeSpine.macroStyle.endingAltitude"),
  };
}

function readMacroStyleReview(value: unknown): MacroStyleReview {
  if (!isRecord(value)) throw new Error("macroStyleReview is required.");
  if (value.skill !== "geek-product-promo-writing") {
    throw new Error("macroStyleReview.skill must be geek-product-promo-writing.");
  }
  if (value.scope !== "macro") throw new Error("macroStyleReview.scope must be macro.");
  if (typeof value.passed !== "boolean") throw new Error("macroStyleReview.passed must be boolean.");

  return {
    skill: "geek-product-promo-writing",
    scope: "macro",
    passed: value.passed,
    findings: readTextArray(value.findings, "macroStyleReview.findings"),
  };
}

function readCarrierOutline(value: unknown, budget: ContentBudget): CarrierOutline {
  if (!isRecord(value)) throw new Error("outline is required.");
  if (budget.carrier === "video") return readVideoOutline(value, budget);
  return readArticleOutline(value, budget);
}

function readVideoOutline(value: Record<string, unknown>, budget: Extract<ContentBudget, { carrier: "video" }>): VideoOutline {
  if (value.carrier !== "video") throw new Error("outline.carrier must be video for a video budget.");
  const segments = readVideoSegments(value.segments);
  assertBeatCount(segments.length, budget, "Video segment");

  const duration = segments.reduce((total, segment) => total + segment.durationSeconds, 0);
  if (duration !== budget.targetDurationSeconds) {
    throw new Error(`Video segment duration must total ${budget.targetDurationSeconds} seconds; received ${duration}.`);
  }

  return {
    carrier: "video",
    hookAndFirstFrame: requiredText(value.hookAndFirstFrame, "outline.hookAndFirstFrame"),
    segments,
    unsupportedClaims: readTextArray(value.unsupportedClaims, "outline.unsupportedClaims"),
    ending: requiredText(value.ending, "outline.ending"),
    primaryCallToAction: nullableText(value.primaryCallToAction, "outline.primaryCallToAction"),
  };
}

function readVideoSegments(value: unknown): VideoOutlineSegment[] {
  if (!Array.isArray(value)) throw new Error("outline.segments must be an array.");
  const ids = new Set<string>();
  return value.map((segment, index) => {
    if (!isRecord(segment)) throw new Error(`outline.segments[${index}] must be an object.`);
    const id = requiredText(segment.id, `outline.segments[${index}].id`);
    if (ids.has(id)) throw new Error(`outline.segments contains duplicate id: ${id}.`);
    ids.add(id);
    const durationSeconds = requiredPositiveInteger(segment.durationSeconds, `outline.segments[${index}].durationSeconds`);
    return {
      id,
      durationSeconds,
      segmentPurpose: requiredText(segment.segmentPurpose, `outline.segments[${index}].segmentPurpose`),
      speaker: nullableText(segment.speaker, `outline.segments[${index}].speaker`),
      speakerAction: nullableText(segment.speakerAction, `outline.segments[${index}].speakerAction`),
      spokenFunction: nullableText(segment.spokenFunction, `outline.segments[${index}].spokenFunction`),
      presentation: nullableText(segment.presentation, `outline.segments[${index}].presentation`),
      visualFunction: nullableText(segment.visualFunction, `outline.segments[${index}].visualFunction`),
      evidence: readTextArray(segment.evidence, `outline.segments[${index}].evidence`),
      transition: nullableText(segment.transition, `outline.segments[${index}].transition`),
    };
  });
}

function readArticleOutline(value: Record<string, unknown>, budget: Extract<ContentBudget, { carrier: "article" }>): ArticleOutline {
  if (value.carrier !== "article") throw new Error("outline.carrier must be article for an article budget.");
  const sections = readArticleSections(value.sections);
  assertBeatCount(sections.length, budget, "Article section");

  return {
    carrier: "article",
    openingDirection: requiredText(value.openingDirection, "outline.openingDirection"),
    sections,
    titleDirections: readTextArray(value.titleDirections, "outline.titleDirections"),
    unsupportedClaims: readTextArray(value.unsupportedClaims, "outline.unsupportedClaims"),
    ending: requiredText(value.ending, "outline.ending"),
    primaryCallToAction: nullableText(value.primaryCallToAction, "outline.primaryCallToAction"),
  };
}

function readArticleSections(value: unknown): ArticleOutlineSection[] {
  if (!Array.isArray(value)) throw new Error("outline.sections must be an array.");
  const ids = new Set<string>();
  const purposes = new Set<string>();
  return value.map((section, index) => {
    if (!isRecord(section)) throw new Error(`outline.sections[${index}] must be an object.`);
    const id = requiredText(section.id, `outline.sections[${index}].id`);
    if (ids.has(id)) throw new Error(`outline.sections contains duplicate id: ${id}.`);
    ids.add(id);
    const sectionPurpose = requiredText(section.sectionPurpose, `outline.sections[${index}].sectionPurpose`);
    const purposeKey = sectionPurpose.toLocaleLowerCase();
    if (purposes.has(purposeKey)) {
      throw new Error(`outline.sections contains duplicate sectionPurpose: ${sectionPurpose}.`);
    }
    purposes.add(purposeKey);

    return {
      id,
      sectionPurpose,
      content: requiredText(section.content, `outline.sections[${index}].content`),
      readerShift: nullableText(section.readerShift, `outline.sections[${index}].readerShift`),
      evidence: readTextArray(section.evidence, `outline.sections[${index}].evidence`),
      authorJudgment: nullableText(section.authorJudgment, `outline.sections[${index}].authorJudgment`),
      transition: nullableText(section.transition, `outline.sections[${index}].transition`),
      visualAsset: nullableText(section.visualAsset, `outline.sections[${index}].visualAsset`),
    };
  });
}

function assertBeatCount(count: number, budget: ContentBudget, label: string): void {
  const [minimum, maximum] = budget.beatRange;
  if (count < minimum || count > maximum) {
    throw new Error(`${label} count must be ${minimum}-${maximum}; received ${count}.`);
  }
}

function assertQuestionCount(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("answeredQuestionCount must be a non-negative integer.");
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty text.`);
  return value.trim();
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return requiredText(value, field);
}

function readTextArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  return value.map((item, index) => requiredText(item, `${field}[${index}]`));
}

function requiredPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
