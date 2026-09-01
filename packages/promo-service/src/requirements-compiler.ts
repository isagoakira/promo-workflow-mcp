import { createHash } from "node:crypto";

export type RequirementCarrier = "video" | "article";

/**
 * The deliberately small hand-off from Node 4's shared asset plan.  A usage
 * describes why a source asset (or one of its fragments) is needed; it does
 * not prescribe who or which tool will produce it.
 */
export interface MasterAssetUsage {
  usageId: string;
  sourceAssetId: string;
  materialType: string;
  purpose: string;
  fragmentId?: string | undefined;
  constraints?: string[] | undefined;
  startMs?: number | undefined;
  endMs?: number | undefined;
  spokenText?: string | undefined;
  oneOffJustification?: string | undefined;
}

export interface CompileRequirementsInput {
  carrier: RequirementCarrier;
  assetUsages: MasterAssetUsage[];
  /** Required for video so subtitle bounds can be proven locally. */
  videoDurationMs?: number | undefined;
}

export interface RequirementUsage {
  usageId: string;
  fragmentId?: string | undefined;
  purpose: string;
  startMs?: number | undefined;
  endMs?: number | undefined;
  oneOffJustification?: string | undefined;
}

/** A tool-neutral material request. One requirement may explicitly cover many usages. */
export interface MaterialRequirement {
  requirementId: string;
  sourceAssetId: string;
  materialType: string;
  constraints: string[];
  usages: RequirementUsage[];
  coverageUsageIds: string[];
  reuseCount: number;
}

export interface SubtitleCue {
  cueId: string;
  sourceUsageId: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface VideoSubtitles {
  cues: SubtitleCue[];
  srt: string;
}

export interface CompiledRequirementSet {
  schemaVersion: 1;
  carrier: RequirementCarrier;
  inputUsageIds: string[];
  requirements: MaterialRequirement[];
  subtitles?: VideoSubtitles | undefined;
}

/**
 * Compiles Node 4's asset usage plan into the smallest compatible local
 * requirement set. The result is stable for semantically equivalent input:
 * grouping and output ordering do not depend on the incoming array order.
 */
export function compileRequirements(input: CompileRequirementsInput): CompiledRequirementSet {
  const usages = validateInput(input);
  const grouped = new Map<string, MasterAssetUsage[]>();

  for (const usage of usages) {
    const key = compatibilityKey(usage);
    const members = grouped.get(key);
    if (members) members.push(usage);
    else grouped.set(key, [usage]);
  }

  const requirements = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, members]) => toRequirement(key, members));
  const result: CompiledRequirementSet = {
    schemaVersion: 1,
    carrier: input.carrier,
    inputUsageIds: usages.map((usage) => usage.usageId).sort(),
    requirements,
    ...(input.carrier === "video" ? { subtitles: compileSubtitles(usages, input.videoDurationMs as number) } : {}),
  };

  validateRequirementCoverage(input.assetUsages, result.requirements);
  if (result.subtitles) validateSubtitles(result.subtitles, input.videoDurationMs as number);
  return result;
}

/** Throws when a compiled result omits or double-covers a master usage. */
export function validateRequirementCoverage(
  assetUsages: readonly Pick<MasterAssetUsage, "usageId">[],
  requirements: readonly Pick<MaterialRequirement, "requirementId" | "coverageUsageIds">[],
): void {
  const inputIds = assetUsages.map((usage) => usage.usageId);
  const uniqueInputIds = new Set(inputIds);
  if (uniqueInputIds.size !== inputIds.length) throw new Error("Master asset usage IDs must be unique.");

  const coverage = new Map<string, string>();
  for (const requirement of requirements) {
    for (const usageId of requirement.coverageUsageIds) {
      if (!uniqueInputIds.has(usageId)) {
        throw new Error(`Requirement ${requirement.requirementId} covers unknown usage ${usageId}.`);
      }
      const previous = coverage.get(usageId);
      if (previous) {
        throw new Error(`Usage ${usageId} is covered by both ${previous} and ${requirement.requirementId}.`);
      }
      coverage.set(usageId, requirement.requirementId);
    }
  }
  for (const usageId of inputIds) {
    if (!coverage.has(usageId)) throw new Error(`Usage ${usageId} is not covered by a material requirement.`);
  }
}

/** Throws when an SRT plan is not ordered, non-overlapping, or in duration bounds. */
export function validateSubtitles(subtitles: VideoSubtitles, videoDurationMs: number): void {
  assertPositiveInteger(videoDurationMs, "videoDurationMs");
  let previousEnd = 0;
  for (const cue of subtitles.cues) {
    if (!cue.cueId || !cue.sourceUsageId || !cue.text.trim()) {
      throw new Error("Subtitle cues require cueId, sourceUsageId, and non-empty text.");
    }
    assertTimestampRange(cue.startMs, cue.endMs, `Subtitle cue ${cue.cueId}`);
    if (cue.endMs > videoDurationMs) {
      throw new Error(`Subtitle cue ${cue.cueId} exceeds video duration.`);
    }
    if (cue.startMs < previousEnd) {
      throw new Error(`Subtitle cue ${cue.cueId} overlaps or precedes the prior cue.`);
    }
    previousEnd = cue.endMs;
  }
  if (subtitles.srt !== serializeSrt(subtitles.cues)) {
    throw new Error("Subtitle SRT does not match its structured cues.");
  }
}

export function serializeSrt(cues: readonly SubtitleCue[]): string {
  return cues.map((cue, index) => `${index + 1}\n${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(cue.endMs)}\n${cue.text}`)
    .join("\n\n");
}

function validateInput(input: CompileRequirementsInput): MasterAssetUsage[] {
  if (input.carrier !== "video" && input.carrier !== "article") {
    throw new Error("carrier must be video or article.");
  }
  if (!Array.isArray(input.assetUsages) || input.assetUsages.length === 0) {
    throw new Error("assetUsages must contain at least one planned usage.");
  }
  if (input.carrier === "video") assertPositiveInteger(input.videoDurationMs, "videoDurationMs");

  const ids = new Set<string>();
  return input.assetUsages.map((usage) => {
    assertText(usage.usageId, "usageId");
    if (ids.has(usage.usageId)) throw new Error(`Duplicate usageId: ${usage.usageId}.`);
    ids.add(usage.usageId);
    assertText(usage.sourceAssetId, `sourceAssetId for ${usage.usageId}`);
    assertText(usage.materialType, `materialType for ${usage.usageId}`);
    assertText(usage.purpose, `purpose for ${usage.usageId}`);
    if (usage.fragmentId !== undefined) assertText(usage.fragmentId, `fragmentId for ${usage.usageId}`);
    const constraints = normalizedConstraints(usage.constraints, usage.usageId);
    const spokenText = usage.spokenText?.trim();
    if (usage.spokenText !== undefined && !spokenText) {
      throw new Error(`spokenText for ${usage.usageId} must be non-empty when supplied.`);
    }
    if (usage.oneOffJustification !== undefined) assertText(usage.oneOffJustification, `oneOffJustification for ${usage.usageId}`);

    if (usage.startMs !== undefined || usage.endMs !== undefined) {
      assertTimestampRange(usage.startMs, usage.endMs, `Usage ${usage.usageId}`);
      if (input.carrier === "video" && (usage.endMs as number) > (input.videoDurationMs as number)) {
        throw new Error(`Usage ${usage.usageId} exceeds video duration.`);
      }
    }
    if (spokenText && (usage.startMs === undefined || usage.endMs === undefined)) {
      throw new Error(`Spoken usage ${usage.usageId} requires startMs and endMs.`);
    }
    return {
      ...usage,
      materialType: usage.materialType.trim(),
      purpose: usage.purpose.trim(),
      constraints,
      ...(spokenText ? { spokenText } : {}),
    };
  });
}

function toRequirement(key: string, members: MasterAssetUsage[]): MaterialRequirement {
  const first = members[0];
  if (!first) throw new Error("Cannot compile an empty requirement group.");
  const usages = members
    .map((usage) => ({
      usageId: usage.usageId,
      ...(usage.fragmentId ? { fragmentId: usage.fragmentId } : {}),
      purpose: usage.purpose,
      ...(usage.startMs !== undefined ? { startMs: usage.startMs } : {}),
      ...(usage.endMs !== undefined ? { endMs: usage.endMs } : {}),
      ...(usage.oneOffJustification ? { oneOffJustification: usage.oneOffJustification.trim() } : {}),
    }))
    .sort((left, right) => left.usageId.localeCompare(right.usageId));
  return {
    requirementId: `req_${shortHash(key)}`,
    sourceAssetId: first.sourceAssetId,
    materialType: first.materialType,
    constraints: normalizedConstraints(first.constraints, first.usageId),
    usages,
    coverageUsageIds: usages.map((usage) => usage.usageId),
    reuseCount: usages.length,
  };
}

function compileSubtitles(usages: readonly MasterAssetUsage[], videoDurationMs: number): VideoSubtitles {
  const cues = usages
    .filter((usage): usage is MasterAssetUsage & { spokenText: string; startMs: number; endMs: number } => (
      typeof usage.spokenText === "string" && usage.startMs !== undefined && usage.endMs !== undefined
    ))
    .map((usage) => ({
      cueId: `cue_${shortHash(usage.usageId)}`,
      sourceUsageId: usage.usageId,
      startMs: usage.startMs,
      endMs: usage.endMs,
      text: usage.spokenText,
    }))
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs || left.sourceUsageId.localeCompare(right.sourceUsageId));
  const subtitles = { cues, srt: serializeSrt(cues) };
  validateSubtitles(subtitles, videoDurationMs);
  return subtitles;
}

function compatibilityKey(usage: MasterAssetUsage): string {
  return JSON.stringify({
    sourceAssetId: usage.sourceAssetId,
    materialType: usage.materialType.trim(),
    constraints: normalizedConstraints(usage.constraints, usage.usageId),
  });
}

function normalizedConstraints(constraints: string[] | undefined, usageId: string): string[] {
  if (constraints === undefined) return [];
  if (!Array.isArray(constraints)) throw new Error(`constraints for ${usageId} must be an array.`);
  return [...new Set(constraints.map((constraint) => {
    assertText(constraint, `constraint for ${usageId}`);
    return constraint.trim();
  }))].sort();
}

function formatSrtTimestamp(milliseconds: number): string {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainder = milliseconds % 1_000;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(remainder, 3)}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function assertTimestampRange(startMs: unknown, endMs: unknown, label: string): void {
  assertNonNegativeInteger(startMs, `${label} startMs`);
  assertPositiveInteger(endMs, `${label} endMs`);
  if ((endMs as number) <= (startMs as number)) throw new Error(`${label} endMs must be greater than startMs.`);
}

function assertNonNegativeInteger(value: unknown, label: string): void {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative integer.`);
}

function assertPositiveInteger(value: unknown, label: string): void {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${label} must be a positive integer.`);
}

function assertText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be non-empty text.`);
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
