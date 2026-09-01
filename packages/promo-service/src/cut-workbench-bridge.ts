import type {
  ProductionUnitStatus,
  VideoContentBudget,
  VideoTimelineMaster,
} from "@promo-workflow/contracts";

import type { CompiledRequirementSet } from "./requirements-compiler.js";

/**
 * The only master shape this bridge accepts.  It deliberately exposes no
 * Cut Workbench job, editor, or generation-provider details.
 */
export interface LockedVideoMaster {
  topicId: string;
  budget: VideoContentBudget;
  master: VideoTimelineMaster;
  confirmedAt: string;
}

/** A durable result already accepted through Promo's production-unit control plane. */
export interface AcceptedProductionResult {
  unitId: string;
  artifactIds: readonly string[];
  provenance: string;
}

export interface CutWorkbenchBridgeInput {
  lockedMaster: LockedVideoMaster;
  requirementSet: CompiledRequirementSet;
  acceptedProductionResults: readonly AcceptedProductionResult[];
}

export interface CutWorkbenchUnitStatus {
  unitId: string;
  status: ProductionUnitStatus;
}

export interface CutWorkbenchFinalGate {
  passed: boolean;
  blockers: readonly string[];
  verifiedAt: string | null;
}

export interface CutWorkbenchProductionResult {
  kind: "production_result";
  projectId: string;
  revision: number;
  unitStatuses: readonly CutWorkbenchUnitStatus[];
  verifiedOutputArtifactIds: readonly string[];
  finalSubtitleArtifactId: string | null;
  finalGate: CutWorkbenchFinalGate;
}

/**
 * A capability gap is an expected, explicit result on machines without a
 * compatible Cut Workbench bridge.  It is not a successful production result.
 */
export interface CutWorkbenchCapabilityGap {
  kind: "capability_gap";
  capability: "cut_workbench";
  reason: string;
  remediation: string;
}

export type CutWorkbenchBridgeResult = CutWorkbenchProductionResult | CutWorkbenchCapabilityGap;

export interface CutWorkbenchBridge {
  run(input: CutWorkbenchBridgeInput): Promise<CutWorkbenchBridgeResult>;
}

/**
 * Safe default for a lightweight Promo installation.  It runs no process,
 * does not inspect local projects, and never invents a Cut Workbench project
 * or render output.
 */
export class UnavailableCutWorkbenchBridge implements CutWorkbenchBridge {
  async run(_input: CutWorkbenchBridgeInput): Promise<CutWorkbenchCapabilityGap> {
    return {
      kind: "capability_gap",
      capability: "cut_workbench",
      reason: "No compatible Cut Workbench bridge is configured; its local/API interface has not been verified for this installation.",
      remediation: "Configure a compatible local Cut Workbench bridge before starting video production.",
    };
  }
}

export const unavailableCutWorkbenchBridge: CutWorkbenchBridge = new UnavailableCutWorkbenchBridge();

/**
 * Wraps a configured bridge with the minimal input/output checks Promo needs.
 * A real integration can be replaced by a test fake without importing any
 * Cut Workbench dependency into this package.
 */
export async function runCutWorkbenchBridge(
  bridge: CutWorkbenchBridge,
  input: CutWorkbenchBridgeInput,
): Promise<CutWorkbenchBridgeResult> {
  assertCutWorkbenchBridgeInput(input);
  const result = await bridge.run(input);
  assertCutWorkbenchBridgeResult(result);
  return result;
}

export function assertCutWorkbenchBridgeInput(input: CutWorkbenchBridgeInput): void {
  if (!isRecord(input)) throw new Error("Cut Workbench bridge input is required.");
  if (!isRecord(input.lockedMaster)) throw new Error("lockedMaster is required.");
  if (input.lockedMaster.budget?.carrier !== "video" || input.lockedMaster.master?.carrier !== "video") {
    throw new Error("Cut Workbench bridge requires a locked video master and video budget.");
  }
  assertText(input.lockedMaster.topicId, "lockedMaster.topicId");
  assertText(input.lockedMaster.confirmedAt, "lockedMaster.confirmedAt");
  if (!isRecord(input.requirementSet) || input.requirementSet.carrier !== "video") {
    throw new Error("Cut Workbench bridge requires a video requirement set.");
  }
  if (!Array.isArray(input.acceptedProductionResults)) {
    throw new Error("acceptedProductionResults must be an array.");
  }

  const unitIds = new Set<string>();
  for (const result of input.acceptedProductionResults) {
    assertText(result.unitId, "acceptedProductionResults[].unitId");
    if (unitIds.has(result.unitId)) throw new Error(`Duplicate accepted production result for unit ${result.unitId}.`);
    unitIds.add(result.unitId);
    if (!Array.isArray(result.artifactIds)) throw new Error(`Accepted production result ${result.unitId} requires artifactIds.`);
    assertUniqueTextArray(result.artifactIds, `accepted production result ${result.unitId} artifactIds`);
    assertText(result.provenance, `accepted production result ${result.unitId} provenance`);
  }
}

export function assertCutWorkbenchBridgeResult(result: CutWorkbenchBridgeResult): void {
  if (!isRecord(result)) throw new Error("Cut Workbench bridge returned no result.");
  if (result.kind === "capability_gap") {
    if (result.capability !== "cut_workbench") throw new Error("Capability gap must identify cut_workbench.");
    assertText(result.reason, "capability gap reason");
    assertText(result.remediation, "capability gap remediation");
    return;
  }
  if (result.kind !== "production_result") throw new Error("Cut Workbench bridge returned an unknown result kind.");
  assertText(result.projectId, "Cut Workbench projectId");
  if (!Number.isInteger(result.revision) || result.revision < 1) {
    throw new Error("Cut Workbench revision must be a positive integer.");
  }
  assertUnitStatuses(result.unitStatuses);
  assertUniqueTextArray(result.verifiedOutputArtifactIds, "verified output artifact IDs");
  if (result.finalSubtitleArtifactId !== null) assertText(result.finalSubtitleArtifactId, "final subtitle artifact ID");
  assertFinalGate(result.finalGate);

  if (result.finalGate.passed) {
    if (!result.finalSubtitleArtifactId) {
      throw new Error("A passed Cut Workbench final gate requires a final subtitle artifact ID.");
    }
    if (result.verifiedOutputArtifactIds.length === 0) {
      throw new Error("A passed Cut Workbench final gate requires verified output artifact IDs.");
    }
  }
}

function assertUnitStatuses(value: unknown): void {
  if (!Array.isArray(value)) throw new Error("Cut Workbench unitStatuses must be an array.");
  const unitIds = new Set<string>();
  const allowedStatuses: readonly ProductionUnitStatus[] = [
    "queued", "active", "waiting_human", "review", "accepted", "needs_replan",
  ];
  for (const status of value) {
    if (!isRecord(status)) throw new Error("Cut Workbench unit status must be an object.");
    assertText(status.unitId, "Cut Workbench unit status unitId");
    if (unitIds.has(status.unitId)) throw new Error(`Duplicate Cut Workbench unit status for ${status.unitId}.`);
    unitIds.add(status.unitId);
    if (!allowedStatuses.includes(status.status as ProductionUnitStatus)) {
      throw new Error(`Unknown Cut Workbench unit status for ${status.unitId}.`);
    }
  }
}

function assertFinalGate(value: unknown): void {
  if (!isRecord(value) || typeof value.passed !== "boolean") {
    throw new Error("Cut Workbench finalGate requires a boolean passed value.");
  }
  assertUniqueTextArray(value.blockers, "Cut Workbench final gate blockers");
  if (value.verifiedAt !== null) assertText(value.verifiedAt, "Cut Workbench final gate verifiedAt");
}

function assertUniqueTextArray(value: unknown, field: string): void {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  const values = new Set<string>();
  for (const item of value) {
    assertText(item, `${field} item`);
    if (values.has(item)) throw new Error(`${field} contains duplicate value ${item}.`);
    values.add(item);
  }
}

function assertText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty text.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
