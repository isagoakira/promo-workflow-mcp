export const WORKFLOW_STATES = [
  "NEEDS_PROFILE",
  "READY",
  "FETCHING",
  "MATCHING",
  "AWAITING_SELECTION",
  "TOPIC_LOCKED",
  "ALIGNING_BASELINE",
  "BASELINE_LOCKED",
  "GENERATING_CREATIVE",
  "ALIGNING_OUTLINE",
  "OUTLINE_LOCKED",
  "GENERATING_MASTER",
  "ALIGNING_MASTER",
  "MASTER_LOCKED",
  "COMPILING_REQUIREMENTS",
  "REQUIREMENTS_READY",
  "AWAITING_HUMAN_REVIEW",
  "REJECTED",
  "PRODUCING",
  "PRODUCTION_LOCKED",
  "PACKAGING",
  "RELEASE_READY",
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export interface PositioningBaseline {
  topicId: string;
  coreMessage: string;
  guidanceIntent: string;
  campaignIntent: CampaignIntentCard;
  /** Present only for article workflows; carries the editorial thread across nodes. */
  articleEditorialIntent?: ArticleEditorialIntent;
  confirmedAt: string;
}

/** A compact, user-readable contract for what the campaign is trying to change. */
export interface CampaignIntentCard {
  audienceMoment: string;
  immediateBenefit: string;
  longTermBenefit: string;
  beliefToChange: string;
  proofToShow: string;
  evidenceBoundary: string;
  narratorPosition: string;
  promotionalTemperature: string;
  primaryCallToAction: string;
  avoid: readonly string[];
}

/** A factual editorial contract, not a license to invent lived experience. */
export interface ArticleEditorialIntent {
  readerDecision: string;
  humanCenter: string;
  authorStance: string;
  warmThread: string;
  emotionalArc: string;
  evidencePosture: string;
}

export interface ScenarioGrillOption {
  id: string;
  label: string;
  rationale: string;
}

/** One consequential, concrete choice. It must say what changes after the answer. */
export interface ScenarioGrillQuestion {
  id: string;
  scene: string;
  tension: string;
  prompt: string;
  options: readonly ScenarioGrillOption[];
  recommendedOptionId: string;
  affectedDeliverables: readonly string[];
}

export interface DecisionLedgerEntry {
  id: string;
  stage: "baseline" | "outline" | "master";
  question: ScenarioGrillQuestion;
  answer: string;
  answeredAt: string;
  requiresRevisionOf: string;
}

export interface BaselineAlignmentCapsule {
  state: "ALIGNING_BASELINE";
  topicId: string;
  selectedMaterials: readonly string[];
  productContext: string;
  inferredUserIntent: string;
  currentRecommendation: {
    coreMessage: string;
    guidanceIntent: string;
    campaignIntent: CampaignIntentCard;
  };
  pendingQuestion: ScenarioGrillQuestion | null;
}

export type BaselineCommit =
  | {
      kind: "grill_answer";
      answer: string;
    }
  | {
      kind: "lock_baseline";
      baseline: PositioningBaseline;
    };

export const STORY_ENGINE_SUGGESTIONS = [
  "single-task-evidence-chain",
  "before-after-workflow",
  "stress-test-ladder",
  "engineering-origin-story",
] as const;

export type ContentTier = "short" | "standard" | "long";

export interface VideoContentBudget {
  carrier: "video";
  tier: ContentTier;
  targetMinutes: 2 | 5 | 10;
  targetDurationSeconds: 120 | 300 | 600;
  beatRange: readonly [number, number];
  targetGrillQuestionRange: readonly [number, number];
}

export interface ArticleContentBudget {
  carrier: "article";
  tier: ContentTier;
  targetChineseCharacterRange: readonly [number, number];
  beatRange: readonly [number, number];
  targetGrillQuestionRange: readonly [number, number];
}

export type ContentBudget = VideoContentBudget | ArticleContentBudget;

export const CONTENT_BUDGETS = {
  video: {
    short: {
      carrier: "video",
      tier: "short",
      targetMinutes: 2,
      targetDurationSeconds: 120,
      beatRange: [4, 4],
      targetGrillQuestionRange: [2, 3],
    },
    standard: {
      carrier: "video",
      tier: "standard",
      targetMinutes: 5,
      targetDurationSeconds: 300,
      beatRange: [5, 7],
      targetGrillQuestionRange: [3, 5],
    },
    long: {
      carrier: "video",
      tier: "long",
      targetMinutes: 10,
      targetDurationSeconds: 600,
      beatRange: [7, 8],
      targetGrillQuestionRange: [4, 6],
    },
  },
  article: {
    short: {
      carrier: "article",
      tier: "short",
      targetChineseCharacterRange: [800, 1500],
      beatRange: [4, 4],
      targetGrillQuestionRange: [2, 3],
    },
    standard: {
      carrier: "article",
      tier: "standard",
      targetChineseCharacterRange: [2000, 3500],
      beatRange: [5, 7],
      targetGrillQuestionRange: [3, 5],
    },
    long: {
      carrier: "article",
      tier: "long",
      targetChineseCharacterRange: [4000, 6000],
      beatRange: [7, 8],
      targetGrillQuestionRange: [4, 6],
    },
  },
} as const satisfies Record<
  "video" | "article",
  Record<ContentTier, ContentBudget>
>;

export interface MacroStyleFrame {
  speakerPosition: string;
  readerRelationship: string;
  promotionalTemperature: string;
  technicalDepth: string;
  emotionalArc: string;
  endingAltitude: string;
}

export interface CreativeSpine {
  routeId: string;
  creativePremise: string;
  storyEngine: string;
  narrativeAnchor: string;
  openingMove: string;
  progression: string;
  proofPlan: string;
  endingMove: string;
  macroStyle: MacroStyleFrame;
}

/** Mutually exclusive story directions offered before the detailed outline. */
export interface CreativeRoute {
  id: string;
  name: string;
  centralTension: string;
  openingScene: string;
  proofMethod: string;
  readerShift: string;
  whyThisRoute: string;
}

export interface CreativeRouteSelection {
  routeId: string;
  selectedAt: string;
}

export interface VideoOutlineSegment {
  id: string;
  durationSeconds: number;
  segmentPurpose: string;
  speaker: string | null;
  speakerAction: string | null;
  spokenFunction: string | null;
  presentation: string | null;
  visualFunction: string | null;
  evidence: readonly string[];
  transition: string | null;
}

export interface ArticleOutlineSection {
  id: string;
  sectionPurpose: string;
  sceneOrAction: string;
  content: string;
  readerShift: string | null;
  evidence: readonly string[];
  authorJudgment: string | null;
  avoid: string | null;
  transition: string | null;
  visualAsset: string | null;
}

export interface VideoOutline {
  carrier: "video";
  hookAndFirstFrame: string;
  segments: readonly VideoOutlineSegment[];
  unsupportedClaims: readonly string[];
  ending: string;
  primaryCallToAction: string | null;
}

export interface ArticleOutline {
  carrier: "article";
  /** Refined from the locked baseline and carried into the manuscript master. */
  editorialIntent: ArticleEditorialIntent;
  openingDirection: string;
  sections: readonly ArticleOutlineSection[];
  titleDirections: readonly string[];
  unsupportedClaims: readonly string[];
  ending: string;
  primaryCallToAction: string | null;
}

export type CarrierOutline = VideoOutline | ArticleOutline;

export interface MacroStyleReview {
  skill: "geek-product-promo-writing";
  scope: "macro";
  passed: boolean;
  findings: readonly string[];
}

export interface OutlineGrillQuestion {
  id: string;
  prompt: string;
  recommendedAnswer: string;
  affectedAreas: readonly string[];
}

export interface OutlineAlignmentCapsule {
  state: "ALIGNING_OUTLINE";
  topicId: string;
  baseline: PositioningBaseline;
  selectedMaterials: readonly string[];
  budget: ContentBudget;
  creativeSpine: CreativeSpine;
  outline: CarrierOutline;
  macroStyleReview: MacroStyleReview;
  answeredQuestionCount: number;
  pendingQuestion: OutlineGrillQuestion | null;
}

export interface LockedCreativeOutline {
  topicId: string;
  budget: ContentBudget;
  creativeSpine: CreativeSpine;
  outline: CarrierOutline;
  macroStyleReview: MacroStyleReview;
  confirmedAt: string;
}

export type OutlineCommit =
  | {
      kind: "outline_grill_answer";
      questionId: string;
      answer: string;
    }
  | {
      kind: "lock_outline";
      creativeOutline: LockedCreativeOutline;
    };

export const MASTER_GRILL_LIMITS = {
  short: 2,
  standard: 3,
  long: 4,
} as const satisfies Record<ContentTier, number>;

export interface AssetFragmentPlan {
  id: string;
  sourceAssetId: string;
  extraction: string | null;
  transformation: string | null;
}

export interface AssetUsagePlan {
  id: string;
  carrier: "video" | "article";
  targetId: string;
  purpose: string;
  sourceAssetId: string;
  fragmentId: string | null;
}

export interface SourceAssetPlan {
  id: string;
  purpose: string;
  evidenceRole: string;
  productionIntent: string;
  /** Pre-production contract for obtaining this one source asset. */
  captureProtocol: SourceAssetCaptureProtocol;
  constraints: readonly string[];
  preferredRoute: string | null;
  reusableFragments: readonly AssetFragmentPlan[];
  usageIds: readonly string[];
  essentialOneOffReason: string | null;
}

export interface SourceAssetCaptureProtocol {
  captureMode: "existing" | "capture" | "generative" | "postproduction";
  /** Ordered path for a live capture; null when no live capture is needed. */
  continuousPath: string | null;
  /** Observable states that must be available to edit or verify later. */
  requiredVisibleStates: readonly string[];
  /** Required material before/after every usable action or state. */
  editingHandles: string | null;
  /** Main/backup or a reason why no backup is appropriate. */
  backupStrategy: string | null;
}

export interface SharedAssetPlan {
  sourceAssets: readonly SourceAssetPlan[];
  usages: readonly AssetUsagePlan[];
  uniqueAcquisitionCount: number;
  plannedUsageCount: number;
  oneOffAssetIds: readonly string[];
}

export interface TimelineRange {
  startMs: number;
  endMs: number;
}

export interface VideoTimelineShot {
  id: string;
  timeRange: TimelineRange;
  shotPurpose: string;
  spokenContent: string | null;
  /** Where the spoken content is recorded. Null only when spokenContent is null. */
  spokenDelivery: "CAM" | "VO" | "MIXED" | null;
  /** Capture-specific instruction, not a direction to invent a new shot. */
  recordingDirection: string | null;
  sound: string | null;
  visualAction: string;
  composition: string;
  cameraBehavior: string | null;
  onScreenText: string | null;
  evidenceRefs: readonly string[];
  assetUsageIds: readonly string[];
  transition: string | null;
}

export interface VideoTimelineMaster {
  carrier: "video";
  workingTitle: string;
  targetDurationSeconds: 120 | 300 | 600;
  shots: readonly VideoTimelineShot[];
  primaryCallToAction: string | null;
  assetPlan: SharedAssetPlan;
}

export interface ArticleAssetPlacement {
  id: string;
  anchor: string;
  assetUsageId: string;
  editorialPurpose: string;
}

export interface ArticleManuscriptMaster {
  carrier: "article";
  title: string;
  alternativeTitles: readonly string[];
  bodyMarkdown: string;
  assetPlacements: readonly ArticleAssetPlacement[];
  primaryCallToAction: string | null;
  assetPlan: SharedAssetPlan;
}

export type ContentMaster = VideoTimelineMaster | ArticleManuscriptMaster;

export interface MasterReview {
  passed: boolean;
  evidenceBlockers: readonly string[];
  writingStyle: {
    skill: "geek-product-promo-writing";
    scope: "macro-meso-micro";
    passed: boolean;
    findings: readonly string[];
  };
  storyboardDirection: {
    skill: "storyboard-direction";
    scope: "shot-continuity-coverage-assets";
    passed: boolean;
    findings: readonly string[];
  } | null;
  articleEditorial: {
    skill: "product-tweet-editor";
    scope: "human-center-evidence-voice";
    passed: boolean;
    findings: readonly string[];
  } | null;
  assetEfficiencyFindings: readonly string[];
}

export interface MasterGrillQuestion {
  id: string;
  prompt: string;
  recommendedAnswer: string;
  blockingReason: string;
  affectedAreas: readonly string[];
}

export interface MasterAlignmentCapsule {
  state: "ALIGNING_MASTER";
  topicId: string;
  creativeOutline: LockedCreativeOutline;
  currentMaster: ContentMaster;
  review: MasterReview;
  answeredQuestionCount: number;
  questionLimit: 2 | 3 | 4;
  pendingQuestion: MasterGrillQuestion | null;
}

export type LockedContentMaster =
  | {
      topicId: string;
      budget: VideoContentBudget;
      master: VideoTimelineMaster;
      review: MasterReview;
      confirmedAt: string;
    }
  | {
      topicId: string;
      budget: ArticleContentBudget;
      master: ArticleManuscriptMaster;
      review: MasterReview;
      confirmedAt: string;
    };

export type MasterCommit =
  | {
      kind: "master_grill_answer";
      questionId: string;
      answer: string;
    }
  | {
      kind: "lock_master";
      contentMaster: LockedContentMaster;
    };

export type MaterialPriority = "blocking" | "required" | "optional";

export interface MaterialRequirement {
  id: string;
  purpose: string;
  specification: string;
  constraints: readonly string[];
  coveredUsageIds: readonly string[];
  reusableFragmentIds: readonly string[];
  preferredRoute: string | null;
  priority: MaterialPriority;
}

export interface SrtCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface SrtArtifact {
  filename: string;
  content: string;
  cues: readonly SrtCue[];
}

export interface RequirementMetrics {
  uniqueAcquisitionCount: number;
  plannedUsageCount: number;
  oneOffRequirementIds: readonly string[];
}

export interface VideoRequirementSet {
  carrier: "video";
  topicId: string;
  requirements: readonly MaterialRequirement[];
  srt: SrtArtifact;
  metrics: RequirementMetrics;
  compiledAt: string;
}

export interface ArticleRequirementSet {
  carrier: "article";
  topicId: string;
  requirements: readonly MaterialRequirement[];
  metrics: RequirementMetrics;
  compiledAt: string;
}

export type MaterialRequirementSet =
  | VideoRequirementSet
  | ArticleRequirementSet;

export interface RequirementsReadyCapsule {
  state: "REQUIREMENTS_READY";
  sourceMaster: LockedContentMaster;
  requirementSet: MaterialRequirementSet;
}

export interface CapabilityGap {
  requirementId: string;
  reason: string;
  availableCapabilities: readonly string[];
  preservedConstraints: readonly string[];
}
