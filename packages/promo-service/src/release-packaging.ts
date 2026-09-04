import type {
  ArticleProductionLockedCapsule,
  ProductionLockedCapsule,
  VideoProductionLockedCapsule,
} from "@promo-workflow/contracts";

import { createAgentWorkCapsule, createGuidanceRequest, type AgentWorkCapsule } from "./agent-work.js";

/**
 * A release claim is deliberately linked to production evidence rather than
 * asking the service to infer whether marketing wording is true.  Semantic
 * review stays with the Agent/user; this module makes the evidence boundary
 * mechanically auditable.
 */
export interface ReleaseEvidenceSource {
  artifactId: string;
  description: string;
}

export interface ReleaseTitleDraft {
  id: string;
  title: string;
  sourceArtifactIds: readonly string[];
}

export interface ReleaseCoverDraft {
  id: string;
  artifactId: string;
  sourceArtifactIds: readonly string[];
  brief: string;
}

export interface ReleaseTextDraft {
  text: string;
  sourceArtifactIds: readonly string[];
}

export interface VideoReleasePackagingDraft {
  carrier: "video";
  titleCandidates: readonly ReleaseTitleDraft[];
  coverCandidates: readonly ReleaseCoverDraft[];
  introductionDraft: ReleaseTextDraft;
}

export interface ArticleReleasePackagingDraft {
  carrier: "article";
  titleCandidates: readonly ReleaseTitleDraft[];
  coverCandidates: readonly ReleaseCoverDraft[];
  summaryDraft: ReleaseTextDraft;
}

export type ReleasePackagingDraft = VideoReleasePackagingDraft | ArticleReleasePackagingDraft;

export interface CreateReleasePackagingBriefInput {
  production: ProductionLockedCapsule;
  evidenceSources: readonly ReleaseEvidenceSource[];
  platformContext?: unknown;
}

export interface ReleasePackagingValidationInput {
  /** Extra evidence is allowed only when it was explicitly provided to the capsule. */
  allowedEvidenceArtifactIds?: readonly string[];
}

export interface ReleasePackagingValidation {
  passed: boolean;
  errors: readonly string[];
  warnings: readonly string[];
}

/**
 * Creates the final soft-work request.  The server never generates covers or
 * marketing copy; it gives the host a small, evidence-bounded target shape.
 */
export function createReleasePackagingBrief(input: CreateReleasePackagingBriefInput): AgentWorkCapsule {
  const productionArtifactIds = getProductionArtifactIds(input.production);
  const evidenceSources = readEvidenceSources(input.evidenceSources, "evidenceSources");
  const allowedEvidenceArtifactIds = uniqueText([
    ...productionArtifactIds,
    ...evidenceSources.map((source) => source.artifactId),
  ]);

  return createAgentWorkCapsule({
    stage: "release_packaging",
    inputs: {
      production: input.production,
      evidenceSources,
      allowedEvidenceArtifactIds,
      ...(input.platformContext === undefined ? {} : { platformContext: input.platformContext }),
    },
    constraints: [
      "Propose exactly three distinct, evidence-safe titles and exactly two cover candidates.",
      "Every title, cover brief, and release text must cite one or more allowed production-evidence artifact IDs.",
      "Do not introduce a feature, result, testimonial, metric, or visual claim absent from the locked production evidence.",
      "A cover may be made with a capable host tool, but return only its local artifact reference and provenance; do not upload or publish.",
      input.production.carrier === "video"
        ? "Return one concise video introduction draft."
        : "Return one article summary draft for the selected platform and its local preview analogue.",
    ],
    requestedOutput: {
      description: "Three title candidates, two evidence-linked cover candidates, and one evidence-linked release-text draft.",
      fields: input.production.carrier === "video"
        ? ["carrier", "titleCandidates", "coverCandidates", "introductionDraft"]
        : ["carrier", "titleCandidates", "coverCandidates", "summaryDraft"],
    },
    validationRules: [
      "Each candidate ID must be unique and its sourceArtifactIds must be within allowedEvidenceArtifactIds.",
      "Submit through promo_commit(kind=submit_release_package).",
      "One final selection is committed through promo_commit(kind=select_release_package).",
    ],
    nextCommitKind: "submit_release_package",
    guidance: createGuidanceRequest(input.production.carrier === "article"
      ? ["human-language-writing", "promo-writing-supervision", "product-tweet-release-packaging"]
      : ["human-language-writing", "promo-writing-supervision"]),
  });
}

/** Parses untrusted Agent output into the carrier-specific release draft. */
export function readReleasePackagingDraft(value: unknown): ReleasePackagingDraft {
  const draft = readRecord(value, "release package draft");
  const carrier = requiredCarrier(draft.carrier, "releasePackage.carrier");
  const titleCandidates = readTitleCandidates(draft.titleCandidates);
  const coverCandidates = readCoverCandidates(draft.coverCandidates);
  return carrier === "video"
    ? {
      carrier,
      titleCandidates,
      coverCandidates,
      introductionDraft: readReleaseText(draft.introductionDraft, "releasePackage.introductionDraft"),
    }
    : {
      carrier,
      titleCandidates,
      coverCandidates,
      summaryDraft: readReleaseText(draft.summaryDraft, "releasePackage.summaryDraft"),
    };
}

/**
 * Applies only deterministic guards.  It cannot prove a claim true, but it
 * rejects candidates whose supplied lineage is absent, empty, or foreign.
 */
export function validateReleasePackagingDraft(
  draft: ReleasePackagingDraft,
  input: ReleasePackagingValidationInput = {},
): ReleasePackagingValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const allowed = input.allowedEvidenceArtifactIds === undefined
    ? undefined
    : new Set(readTextArray(input.allowedEvidenceArtifactIds, "allowedEvidenceArtifactIds"));

  if (draft.titleCandidates.length !== 3) {
    errors.push(`Release package requires exactly 3 title candidates; received ${draft.titleCandidates.length}.`);
  }
  if (draft.coverCandidates.length !== 2) {
    errors.push(`Release package requires exactly 2 cover candidates; received ${draft.coverCandidates.length}.`);
  }

  validateUniqueIds(draft.titleCandidates.map((candidate) => candidate.id), "Title candidate", errors);
  validateUniqueIds(draft.coverCandidates.map((candidate) => candidate.id), "Cover candidate", errors);
  validateUniqueText(draft.titleCandidates.map((candidate) => candidate.title), "Title", errors);
  validateUniqueText(draft.coverCandidates.map((candidate) => candidate.artifactId), "Cover artifact", errors);

  for (const candidate of draft.titleCandidates) {
    validateLineage(candidate.sourceArtifactIds, `Title candidate ${candidate.id}`, allowed, errors);
  }
  for (const candidate of draft.coverCandidates) {
    validateLineage(candidate.sourceArtifactIds, `Cover candidate ${candidate.id}`, allowed, errors);
  }

  const releaseText = draft.carrier === "video" ? draft.introductionDraft : draft.summaryDraft;
  validateLineage(releaseText.sourceArtifactIds, draft.carrier === "video" ? "Introduction draft" : "Summary draft", allowed, errors);
  if (releaseText.text.length > 500) warnings.push("Release text exceeds 500 characters; check the target platform's packaging convention.");

  return { passed: errors.length === 0, errors, warnings };
}

/** Returns the evidence artifacts directly produced by the locked Node 6 branch. */
export function getProductionArtifactIds(production: ProductionLockedCapsule): readonly string[] {
  return production.carrier === "video"
    ? getVideoProductionArtifactIds(production)
    : getArticleProductionArtifactIds(production);
}

function getVideoProductionArtifactIds(production: VideoProductionLockedCapsule): readonly string[] {
  return uniqueText(production.outputArtifactIds);
}

function getArticleProductionArtifactIds(production: ArticleProductionLockedCapsule): readonly string[] {
  return uniqueText([
    production.outputArtifacts.documentArtifactId,
    production.outputArtifacts.previewArtifactId,
    production.outputArtifacts.assetManifestArtifactId,
  ]);
}

function readEvidenceSources(value: readonly ReleaseEvidenceSource[], field: string): ReleaseEvidenceSource[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  const ids = new Set<string>();
  return value.map((source, index) => {
    if (!isRecord(source)) throw new Error(`${field}[${index}] must be an object.`);
    const artifactId = requiredText(source.artifactId, `${field}[${index}].artifactId`);
    if (ids.has(artifactId)) throw new Error(`${field} contains duplicate artifactId: ${artifactId}.`);
    ids.add(artifactId);
    return { artifactId, description: requiredText(source.description, `${field}[${index}].description`) };
  });
}

function readTitleCandidates(value: unknown): ReleaseTitleDraft[] {
  if (!Array.isArray(value)) throw new Error("releasePackage.titleCandidates must be an array.");
  return value.map((candidate, index) => {
    const record = readRecord(candidate, `releasePackage.titleCandidates[${index}]`);
    return {
      id: requiredText(record.id, `releasePackage.titleCandidates[${index}].id`),
      title: requiredText(record.title, `releasePackage.titleCandidates[${index}].title`),
      sourceArtifactIds: readTextArray(record.sourceArtifactIds, `releasePackage.titleCandidates[${index}].sourceArtifactIds`),
    };
  });
}

function readCoverCandidates(value: unknown): ReleaseCoverDraft[] {
  if (!Array.isArray(value)) throw new Error("releasePackage.coverCandidates must be an array.");
  return value.map((candidate, index) => {
    const record = readRecord(candidate, `releasePackage.coverCandidates[${index}]`);
    return {
      id: requiredText(record.id, `releasePackage.coverCandidates[${index}].id`),
      artifactId: requiredText(record.artifactId, `releasePackage.coverCandidates[${index}].artifactId`),
      sourceArtifactIds: readTextArray(record.sourceArtifactIds, `releasePackage.coverCandidates[${index}].sourceArtifactIds`),
      brief: requiredText(record.brief, `releasePackage.coverCandidates[${index}].brief`),
    };
  });
}

function readReleaseText(value: unknown, field: string): ReleaseTextDraft {
  const record = readRecord(value, field);
  return {
    text: requiredText(record.text, `${field}.text`),
    sourceArtifactIds: readTextArray(record.sourceArtifactIds, `${field}.sourceArtifactIds`),
  };
}

function validateLineage(
  artifactIds: readonly string[],
  label: string,
  allowed: ReadonlySet<string> | undefined,
  errors: string[],
): void {
  if (artifactIds.length === 0) {
    errors.push(`${label} must cite at least one source artifact.`);
    return;
  }
  validateUniqueIds(artifactIds, `${label} source artifact`, errors);
  if (!allowed) return;
  for (const artifactId of artifactIds) {
    if (!allowed.has(artifactId)) errors.push(`${label} cites unknown or unapproved evidence artifact ${artifactId}.`);
  }
}

function validateUniqueIds(ids: readonly string[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`${label} IDs contain duplicate id: ${id}.`);
    seen.add(id);
  }
}

function validateUniqueText(values: readonly string[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = value.trim().toLocaleLowerCase();
    if (seen.has(key)) errors.push(`${label}s must be distinct: ${value}.`);
    seen.add(key);
  }
}

function uniqueText(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => requiredText(value, "artifactId")))];
}

function readTextArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  return value.map((item, index) => requiredText(item, `${field}[${index}]`));
}

function requiredCarrier(value: unknown, field: string): "video" | "article" {
  if (value === "video" || value === "article") return value;
  throw new Error(`${field} must be video or article.`);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty text.`);
  return value.trim();
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} must be an object.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
