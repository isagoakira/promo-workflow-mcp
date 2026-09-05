import type {
  ArticleAssetPlacement,
  ArticleManuscriptMaster,
  AssetFragmentPlan,
  AssetUsagePlan,
  ContentBudget,
  ContentMaster,
  LockedCreativeOutline,
  SharedAssetPlan,
  SourceAssetPlan,
  SourceAssetCaptureProtocol,
  TimelineRange,
  VideoTimelineMaster,
  VideoTimelineShot,
} from "@promo-workflow/contracts";
import { createAgentWorkCapsule, createGuidanceRequest, type AgentWorkCapsule } from "./agent-work.js";

export interface CreateMasterDevelopmentBriefInput {
  currentRequirements?: unknown;
  creativeOutline: LockedCreativeOutline;
  selectedMaterials: readonly string[];
  productContext: unknown;
}

export interface MasterDraftValidationInput {
  budget?: ContentBudget | undefined;
}

export interface MasterDraftValidation {
  passed: boolean;
  errors: readonly string[];
  warnings: readonly string[];
}

/**
 * Creates the soft-work capsule for Node 4. The Agent writes the master; this
 * service module only gives it a stable target shape and validates the result.
 */
export function createMasterDevelopmentBrief(input: CreateMasterDevelopmentBriefInput): AgentWorkCapsule {
  const carrier = input.creativeOutline.budget.carrier;
  return createAgentWorkCapsule({
    stage: "master_development",
    inputs: {
      creativeOutline: input.creativeOutline,
      selectedMaterials: input.selectedMaterials,
      productContext: input.productContext,
      ...(input.currentRequirements ? { currentRequirements: input.currentRequirements } : {}),
    },
    constraints: [
      "Expand the locked creative outline without changing its proposition, evidence boundary, or ending intent.",
      carrier === "video"
        ? "Return a continuous time-aligned storyboard whose total duration exactly matches the selected budget; mark every spoken shot CAM, VO, or MIXED and give it a recordingDirection."
        : "Return one complete Markdown manuscript with source-preserving claims and useful title alternatives.",
      "Return one shared asset plan using source asset -> reusable fragment -> usage; every source asset must carry a captureProtocol with visible states, handles, and backup strategy.",
      "Every ordinary source asset must have two meaningful usages; a single-use asset needs an essential one-off reason.",
      "Use geek-product-promo-writing for writing supervision and storyboard-direction for video craft supervision.",
      "Ask a Grill question only for a blocking choice; do not use it for local wording, timing, or ordinary reuse fixes.",
    ],
    requestedOutput: {
      description: carrier === "video"
        ? "A complete video storyboard master and shared asset plan. It must be sufficient to derive the spoken-lines and recording-execution deliverables without inventing a new claim."
        : "A complete article manuscript master and shared asset plan.",
      fields: carrier === "video"
        ? ["carrier", "workingTitle", "targetDurationSeconds", "shots[id,timeRange,shotPurpose,spokenContent,spokenDelivery,recordingDirection,visualAction,evidenceRefs,assetUsageIds]", "assetPlan[sourceAssets.captureProtocol]", "primaryCallToAction"]
        : ["carrier", "title", "alternativeTitles", "bodyMarkdown", "assetPlacements", "primaryCallToAction", "assetPlan"],
    },
    validationRules: [
      "Submit through promo_commit(kind=submit_master_draft).",
      "The service validates only structure, timing, links, counts, and reuse rules; review conclusions remain explicit Agent output.",
      "Lock only after the complete master, review, and asset plan pass validation.",
    ],
    nextCommitKind: "submit_master_draft",
    guidance: createGuidanceRequest(carrier === "video"
      ? ["human-language-writing", "promo-writing-supervision", "promo-storyboard-supervision", "product-voiceover-campaign", "promo-deliverable-exemplars", "tim-cinematic-video-proof-plan"]
      : ["human-language-writing", "promo-writing-supervision", "product-tweet-manuscript-proof", "product-tweet-visual-proof"]),
  });
}

/** Parses untrusted Agent output into the contract's carrier-specific master. */
export function readMasterDraft(value: unknown): ContentMaster {
  const draft = readRecord(value, "master draft");
  const carrier = requiredLiteral(draft.carrier, "master.carrier", ["video", "article"] as const);
  return carrier === "video" ? readVideoMaster(draft) : readArticleMaster(draft);
}

/** Deterministic structural validation used before a draft can enter Grill/lock. */
export function validateMasterDraft(
  master: ContentMaster,
  input: MasterDraftValidationInput = {},
): MasterDraftValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  validateBudget(master, input.budget, errors);
  validateAssetPlan(master.assetPlan, errors, warnings);

  if (master.carrier === "video") {
    validateVideoMaster(master, errors);
  } else {
    validateArticleMaster(master, errors, warnings);
  }
  return { passed: errors.length === 0, errors, warnings };
}

function readVideoMaster(value: Record<string, unknown>): VideoTimelineMaster {
  const targetDurationSeconds = requiredDuration(value.targetDurationSeconds, "master.targetDurationSeconds");
  return {
    carrier: "video",
    workingTitle: requiredText(value.workingTitle, "master.workingTitle"),
    targetDurationSeconds,
    shots: readArray(value.shots, "master.shots").map((shot, index) => readVideoShot(shot, index)),
    primaryCallToAction: optionalTextOrNull(value.primaryCallToAction, "master.primaryCallToAction"),
    assetPlan: readAssetPlan(value.assetPlan),
  };
}

function readVideoShot(value: unknown, index: number): VideoTimelineShot {
  const shot = readRecord(value, `master.shots[${index}]`);
  return {
    id: requiredText(shot.id, `master.shots[${index}].id`),
    timeRange: readTimeRange(shot.timeRange, `master.shots[${index}].timeRange`),
    shotPurpose: requiredText(shot.shotPurpose, `master.shots[${index}].shotPurpose`),
    spokenContent: optionalTextOrNull(shot.spokenContent, `master.shots[${index}].spokenContent`),
    spokenDelivery: readSpokenDelivery(shot.spokenDelivery, shot.spokenContent, `master.shots[${index}].spokenDelivery`),
    recordingDirection: optionalTextOrNull(shot.recordingDirection, `master.shots[${index}].recordingDirection`),
    sound: optionalTextOrNull(shot.sound, `master.shots[${index}].sound`),
    visualAction: requiredText(shot.visualAction, `master.shots[${index}].visualAction`),
    composition: requiredText(shot.composition, `master.shots[${index}].composition`),
    cameraBehavior: optionalTextOrNull(shot.cameraBehavior, `master.shots[${index}].cameraBehavior`),
    onScreenText: optionalTextOrNull(shot.onScreenText, `master.shots[${index}].onScreenText`),
    evidenceRefs: readTextArray(shot.evidenceRefs, `master.shots[${index}].evidenceRefs`),
    assetUsageIds: readTextArray(shot.assetUsageIds, `master.shots[${index}].assetUsageIds`),
    transition: optionalTextOrNull(shot.transition, `master.shots[${index}].transition`),
  };
}

function readArticleMaster(value: Record<string, unknown>): ArticleManuscriptMaster {
  return {
    carrier: "article",
    title: requiredText(value.title, "master.title"),
    alternativeTitles: readTextArray(value.alternativeTitles, "master.alternativeTitles"),
    bodyMarkdown: requiredText(value.bodyMarkdown, "master.bodyMarkdown"),
    assetPlacements: readArray(value.assetPlacements, "master.assetPlacements")
      .map((placement, index) => readArticlePlacement(placement, index)),
    primaryCallToAction: optionalTextOrNull(value.primaryCallToAction, "master.primaryCallToAction"),
    assetPlan: readAssetPlan(value.assetPlan),
  };
}

function readArticlePlacement(value: unknown, index: number): ArticleAssetPlacement {
  const placement = readRecord(value, `master.assetPlacements[${index}]`);
  return {
    id: requiredText(placement.id, `master.assetPlacements[${index}].id`),
    anchor: requiredText(placement.anchor, `master.assetPlacements[${index}].anchor`),
    assetUsageId: requiredText(placement.assetUsageId, `master.assetPlacements[${index}].assetUsageId`),
    editorialPurpose: requiredText(placement.editorialPurpose, `master.assetPlacements[${index}].editorialPurpose`),
  };
}

function readAssetPlan(value: unknown): SharedAssetPlan {
  const plan = readRecord(value, "master.assetPlan");
  return {
    sourceAssets: readArray(plan.sourceAssets, "master.assetPlan.sourceAssets")
      .map((source, index) => readSourceAsset(source, index)),
    usages: readArray(plan.usages, "master.assetPlan.usages")
      .map((usage, index) => readAssetUsage(usage, index)),
    uniqueAcquisitionCount: requiredNonNegativeInteger(plan.uniqueAcquisitionCount, "master.assetPlan.uniqueAcquisitionCount"),
    plannedUsageCount: requiredNonNegativeInteger(plan.plannedUsageCount, "master.assetPlan.plannedUsageCount"),
    oneOffAssetIds: readTextArray(plan.oneOffAssetIds, "master.assetPlan.oneOffAssetIds"),
  };
}

function readSourceAsset(value: unknown, index: number): SourceAssetPlan {
  const source = readRecord(value, `master.assetPlan.sourceAssets[${index}]`);
  const id = requiredText(source.id, `master.assetPlan.sourceAssets[${index}].id`);
  return {
    id,
    purpose: requiredText(source.purpose, `master.assetPlan.sourceAssets[${index}].purpose`),
    evidenceRole: requiredText(source.evidenceRole, `master.assetPlan.sourceAssets[${index}].evidenceRole`),
    productionIntent: requiredText(source.productionIntent, `master.assetPlan.sourceAssets[${index}].productionIntent`),
    captureProtocol: readCaptureProtocol(source.captureProtocol, index),
    constraints: readTextArray(source.constraints, `master.assetPlan.sourceAssets[${index}].constraints`),
    preferredRoute: optionalTextOrNull(source.preferredRoute, `master.assetPlan.sourceAssets[${index}].preferredRoute`),
    reusableFragments: readArray(source.reusableFragments, `master.assetPlan.sourceAssets[${index}].reusableFragments`)
      .map((fragment, fragmentIndex) => readAssetFragment(fragment, index, id, fragmentIndex)),
    usageIds: readTextArray(source.usageIds, `master.assetPlan.sourceAssets[${index}].usageIds`),
    essentialOneOffReason: optionalTextOrNull(source.essentialOneOffReason, `master.assetPlan.sourceAssets[${index}].essentialOneOffReason`),
  };
}

function readCaptureProtocol(value: unknown, sourceIndex: number): SourceAssetCaptureProtocol {
  const protocol = readRecord(value, `master.assetPlan.sourceAssets[${sourceIndex}].captureProtocol`);
  const captureMode = requiredLiteral(protocol.captureMode, `master.assetPlan.sourceAssets[${sourceIndex}].captureProtocol.captureMode`, ["existing", "capture", "generative", "postproduction"] as const);
  const continuousPath = optionalTextOrNull(protocol.continuousPath, `master.assetPlan.sourceAssets[${sourceIndex}].captureProtocol.continuousPath`);
  const editingHandles = optionalTextOrNull(protocol.editingHandles, `master.assetPlan.sourceAssets[${sourceIndex}].captureProtocol.editingHandles`);
  const backupStrategy = optionalTextOrNull(protocol.backupStrategy, `master.assetPlan.sourceAssets[${sourceIndex}].captureProtocol.backupStrategy`);
  const requiredVisibleStates = readTextArray(protocol.requiredVisibleStates, `master.assetPlan.sourceAssets[${sourceIndex}].captureProtocol.requiredVisibleStates`);
  if (captureMode === "capture" && (!continuousPath || !editingHandles || !backupStrategy)) {
    throw new Error(`Captured source ${sourceIndex} needs continuousPath, editingHandles, and backupStrategy.`);
  }
  if (requiredVisibleStates.length === 0) throw new Error(`Source ${sourceIndex} needs at least one requiredVisibleState.`);
  return { captureMode, continuousPath, requiredVisibleStates, editingHandles, backupStrategy };
}

function readAssetFragment(value: unknown, sourceIndex: number, sourceAssetId: string, index: number): AssetFragmentPlan {
  const fragment = readRecord(value, `master.assetPlan.sourceAssets[${sourceIndex}].reusableFragments[${index}]`);
  return {
    id: requiredText(fragment.id, `master.assetPlan.sourceAssets[${sourceIndex}].reusableFragments[${index}].id`),
    sourceAssetId: requiredText(fragment.sourceAssetId, `master.assetPlan.sourceAssets[${sourceIndex}].reusableFragments[${index}].sourceAssetId`),
    extraction: optionalTextOrNull(fragment.extraction, `master.assetPlan.sourceAssets[${sourceIndex}].reusableFragments[${index}].extraction`),
    transformation: optionalTextOrNull(fragment.transformation, `master.assetPlan.sourceAssets[${sourceIndex}].reusableFragments[${index}].transformation`),
  };
}

function readAssetUsage(value: unknown, index: number): AssetUsagePlan {
  const usage = readRecord(value, `master.assetPlan.usages[${index}]`);
  return {
    id: requiredText(usage.id, `master.assetPlan.usages[${index}].id`),
    carrier: requiredLiteral(usage.carrier, `master.assetPlan.usages[${index}].carrier`, ["video", "article"] as const),
    targetId: requiredText(usage.targetId, `master.assetPlan.usages[${index}].targetId`),
    purpose: requiredText(usage.purpose, `master.assetPlan.usages[${index}].purpose`),
    sourceAssetId: requiredText(usage.sourceAssetId, `master.assetPlan.usages[${index}].sourceAssetId`),
    fragmentId: optionalTextOrNull(usage.fragmentId, `master.assetPlan.usages[${index}].fragmentId`),
  };
}

function validateBudget(master: ContentMaster, budget: ContentBudget | undefined, errors: string[]): void {
  if (!budget) return;
  if (budget.carrier !== master.carrier) {
    errors.push(`Master carrier ${master.carrier} does not match the selected ${budget.carrier} budget.`);
    return;
  }
  if (master.carrier === "video" && budget.carrier === "video" && master.targetDurationSeconds !== budget.targetDurationSeconds) {
    errors.push(`Video targetDurationSeconds must equal the selected ${budget.targetDurationSeconds}-second budget.`);
  }
  if (master.carrier === "article" && budget.carrier === "article") {
    const characterCount = countMeaningfulCharacters(master.bodyMarkdown);
    const [minimum, maximum] = budget.targetChineseCharacterRange;
    if (characterCount < minimum || characterCount > maximum) {
      errors.push(`Article body has ${characterCount} meaningful characters; selected budget requires ${minimum}-${maximum}.`);
    }
  }
}

function validateVideoMaster(master: VideoTimelineMaster, errors: string[]): void {
  if (master.shots.length === 0) {
    errors.push("Video master needs at least one timed shot.");
    return;
  }
  validateUnique(master.shots.map((shot) => shot.id), "Video shot IDs", errors);
  let previousEnd = 0;
  for (const shot of master.shots) {
    if (shot.timeRange.startMs !== previousEnd) {
      errors.push(`Shot ${shot.id} must start at ${previousEnd}ms to keep the storyboard continuous.`);
    }
    if (shot.timeRange.endMs <= shot.timeRange.startMs) {
      errors.push(`Shot ${shot.id} must have a positive time range.`);
    }
    if (shot.spokenContent && shot.spokenDelivery === null) {
      errors.push(`Shot ${shot.id} has spokenContent but no spokenDelivery.`);
    }
    if (!shot.spokenContent && shot.spokenDelivery !== null) {
      errors.push(`Shot ${shot.id} has spokenDelivery but no spokenContent.`);
    }
    if (shot.spokenContent && !shot.recordingDirection) {
      errors.push(`Shot ${shot.id} has spokenContent but no recordingDirection.`);
    }
    previousEnd = shot.timeRange.endMs;
  }
  if (previousEnd !== master.targetDurationSeconds * 1000) {
    errors.push(`Storyboard ends at ${previousEnd}ms; it must end at ${master.targetDurationSeconds * 1000}ms.`);
  }

  const usageById = mapById(master.assetPlan.usages);
  const shotIds = new Set(master.shots.map((shot) => shot.id));
  for (const shot of master.shots) {
    validateUnique(shot.assetUsageIds, `Asset usage IDs in shot ${shot.id}`, errors);
    for (const usageId of shot.assetUsageIds) {
      const usage = usageById.get(usageId);
      if (!usage) {
        errors.push(`Shot ${shot.id} references unknown asset usage ${usageId}.`);
      } else if (usage.carrier !== "video" || usage.targetId !== shot.id) {
        errors.push(`Asset usage ${usageId} must target video shot ${shot.id}.`);
      }
    }
  }
  for (const usage of master.assetPlan.usages.filter((item) => item.carrier === "video")) {
    if (!shotIds.has(usage.targetId)) errors.push(`Video asset usage ${usage.id} targets unknown shot ${usage.targetId}.`);
    else if (!master.shots.find((shot) => shot.id === usage.targetId)?.assetUsageIds.includes(usage.id)) {
      errors.push(`Video asset usage ${usage.id} is not listed by its target shot ${usage.targetId}.`);
    }
  }
}

function validateArticleMaster(master: ArticleManuscriptMaster, errors: string[], warnings: string[]): void {
  validateUnique(master.alternativeTitles, "Article alternative titles", errors);
  validateUnique(master.assetPlacements.map((placement) => placement.id), "Article asset placement IDs", errors);
  if (master.alternativeTitles.includes(master.title)) warnings.push("Article alternative titles include the selected title.");

  const usageById = mapById(master.assetPlan.usages);
  const placementIds = new Set(master.assetPlacements.map((placement) => placement.id));
  for (const placement of master.assetPlacements) {
    if (!master.bodyMarkdown.includes(placement.anchor)) {
      errors.push(`Article asset placement ${placement.id} anchor does not occur in bodyMarkdown.`);
    }
    const usage = usageById.get(placement.assetUsageId);
    if (!usage) {
      errors.push(`Article asset placement ${placement.id} references unknown asset usage ${placement.assetUsageId}.`);
    } else if (usage.carrier !== "article" || usage.targetId !== placement.id) {
      errors.push(`Asset usage ${usage.id} must target article placement ${placement.id}.`);
    }
  }
  for (const usage of master.assetPlan.usages.filter((item) => item.carrier === "article")) {
    if (!placementIds.has(usage.targetId)) errors.push(`Article asset usage ${usage.id} targets unknown placement ${usage.targetId}.`);
    else if (!master.assetPlacements.find((placement) => placement.id === usage.targetId)?.assetUsageId.includes(usage.id)) {
      errors.push(`Article asset usage ${usage.id} is not listed by its target placement ${usage.targetId}.`);
    }
  }
}

function validateAssetPlan(plan: SharedAssetPlan, errors: string[], warnings: string[]): void {
  validateUnique(plan.sourceAssets.map((source) => source.id), "Asset source IDs", errors);
  validateUnique(plan.usages.map((usage) => usage.id), "Asset usage IDs", errors);
  validateUnique(plan.oneOffAssetIds, "One-off asset IDs", errors);
  const fragments = plan.sourceAssets.flatMap((source) => source.reusableFragments);
  validateUnique(fragments.map((fragment) => fragment.id), "Asset fragment IDs", errors);

  if (plan.uniqueAcquisitionCount !== plan.sourceAssets.length) {
    errors.push("uniqueAcquisitionCount must equal the number of source assets.");
  }
  if (plan.plannedUsageCount !== plan.usages.length) {
    errors.push("plannedUsageCount must equal the number of asset usages.");
  }

  const sourcesById = mapById(plan.sourceAssets);
  const fragmentsById = mapById(fragments);
  const usagesById = mapById(plan.usages);
  const declaredOneOffs = new Set(plan.oneOffAssetIds);

  for (const fragment of fragments) {
    if (!sourcesById.has(fragment.sourceAssetId)) {
      errors.push(`Asset fragment ${fragment.id} references unknown source ${fragment.sourceAssetId}.`);
    }
  }
  for (const usage of plan.usages) {
    const source = sourcesById.get(usage.sourceAssetId);
    if (!source) {
      errors.push(`Asset usage ${usage.id} references unknown source ${usage.sourceAssetId}.`);
      continue;
    }
    if (!source.usageIds.includes(usage.id)) {
      errors.push(`Asset usage ${usage.id} is absent from source ${source.id}.usageIds.`);
    }
    if (usage.fragmentId) {
      const fragment = fragmentsById.get(usage.fragmentId);
      if (!fragment) errors.push(`Asset usage ${usage.id} references unknown fragment ${usage.fragmentId}.`);
      else if (fragment.sourceAssetId !== source.id) errors.push(`Asset usage ${usage.id} uses fragment ${fragment.id} from another source.`);
    }
  }
  for (const source of plan.sourceAssets) {
    validateUnique(source.usageIds, `Usage IDs for source ${source.id}`, errors);
    for (const usageId of source.usageIds) {
      const usage = usagesById.get(usageId);
      if (!usage) errors.push(`Source ${source.id} references unknown usage ${usageId}.`);
      else if (usage.sourceAssetId !== source.id) errors.push(`Source ${source.id} lists usage ${usage.id} owned by ${usage.sourceAssetId}.`);
    }
    const usageCount = source.usageIds.length;
    if (usageCount === 0) {
      errors.push(`Source ${source.id} has no planned usage.`);
    } else if (usageCount === 1) {
      if (!source.essentialOneOffReason) errors.push(`One-use source ${source.id} needs an essentialOneOffReason.`);
      if (!declaredOneOffs.has(source.id)) errors.push(`One-use source ${source.id} must appear in oneOffAssetIds.`);
    } else if (source.essentialOneOffReason) {
      warnings.push(`Source ${source.id} has multiple usages; its one-off reason is ignored.`);
    }
  }
  for (const sourceId of plan.oneOffAssetIds) {
    const source = sourcesById.get(sourceId);
    if (!source) errors.push(`oneOffAssetIds references unknown source ${sourceId}.`);
    else if (source.usageIds.length !== 1 || !source.essentialOneOffReason) {
      errors.push(`oneOffAssetIds entry ${sourceId} must have exactly one usage and an essentialOneOffReason.`);
    }
  }
}

function readTimeRange(value: unknown, field: string): TimelineRange {
  const range = readRecord(value, field);
  return {
    startMs: requiredNonNegativeInteger(range.startMs, `${field}.startMs`),
    endMs: requiredNonNegativeInteger(range.endMs, `${field}.endMs`),
  };
}

function requiredDuration(value: unknown, field: string): 120 | 300 | 600 {
  if (value === 120 || value === 300 || value === 600) return value;
  throw new Error(`${field} must be 120, 300, or 600.`);
}

function requiredLiteral<T extends readonly string[]>(value: unknown, field: string, choices: T): T[number] {
  if (typeof value === "string" && (choices as readonly string[]).includes(value)) return value as T[number];
  throw new Error(`${field} must be one of: ${choices.join(", ")}.`);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty text.`);
  return value.trim();
}

function optionalTextOrNull(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  return requiredText(value, field);
}

function readSpokenDelivery(value: unknown, spokenContent: unknown, field: string): "CAM" | "VO" | "MIXED" | null {
  if (spokenContent === undefined || spokenContent === null) {
    if (value === undefined || value === null) return null;
    return requiredLiteral(value, field, ["CAM", "VO", "MIXED"] as const);
  }
  return requiredLiteral(value, field, ["CAM", "VO", "MIXED"] as const);
}

function readTextArray(value: unknown, field: string): readonly string[] {
  return readArray(value, field).map((item, index) => requiredText(item, `${field}[${index}]`));
}

function readArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  return value;
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value as Record<string, unknown>;
}

function requiredNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return value;
}

function validateUnique(ids: readonly string[], label: string, errors: string[]): void {
  if (new Set(ids).size !== ids.length) errors.push(`${label} must be unique.`);
}

function mapById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function countMeaningfulCharacters(value: string): number {
  return Array.from(value.replace(/\s/g, "")).length;
}
