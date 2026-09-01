import type { ProductionUnit } from "@promo-workflow/contracts";

import type { ArtifactRef } from "./artifacts/types.js";

export type AcceptedArtifactRef = Omit<ArtifactRef, "parentArtifactIds"> & {
  parentArtifactIds: readonly string[];
};

/**
 * The small immutable hand-off from a carrier backend back to Promo. It
 * carries evidence only; route, requirements, dependencies, and unit status
 * remain owned by the production plan.
 */
export interface ProductionUnitAcceptanceResult {
  unitId: string;
  acceptedArtifactRefs: readonly AcceptedArtifactRef[];
  provenanceNote: string;
  backendRevision: number;
}

export interface ValidateProductionResultsInput {
  /** The original plan whose route/requirements/dependencies are authoritative. */
  plannedUnits: readonly ProductionUnit[];
  /** The backend's current view. Only status may differ from the plan. */
  currentUnits: readonly ProductionUnit[];
  results: readonly ProductionUnitAcceptanceResult[];
  /**
   * Required inputs expressed as artifact IDs. Each must be present either as
   * an accepted output or in an accepted output's immutable parent lineage.
   */
  requiredSourceArtifactIdsByUnit?: Readonly<Record<string, readonly string[]>> | undefined;
}

/**
 * Validates a production result batch and returns a detached immutable value.
 * A result is allowed only for a known, accepted unit; all accepted units
 * require exactly one result. This keeps carrier evidence auditable without
 * importing a second backend state machine into Promo.
 */
export function validateProductionResults(input: ValidateProductionResultsInput): readonly ProductionUnitAcceptanceResult[] {
  const planned = indexUnits(input.plannedUnits, "plannedUnits");
  const current = indexUnits(input.currentUnits, "currentUnits");
  assertUnchangedUnitShape(planned, current);
  assertRequiredSourceKeys(input.requiredSourceArtifactIdsByUnit, planned);

  const expectedResultIds = [...current.values()]
    .filter((unit) => unit.status === "accepted")
    .map((unit) => unit.id)
    .sort();
  const seen = new Set<string>();
  const validated = input.results.map((result) => {
    assertResultShape(result);
    if (seen.has(result.unitId)) throw new Error(`Duplicate production result for ${result.unitId}.`);
    seen.add(result.unitId);
    const unit = current.get(result.unitId);
    if (!unit) throw new Error(`Production result references unknown unit ${result.unitId}.`);
    if (unit.status !== "accepted") throw new Error(`Production result ${result.unitId} requires an accepted unit.`);
    assertRequiredSources(result, input.requiredSourceArtifactIdsByUnit?.[result.unitId] ?? []);
    return immutableResult(result);
  });
  const actualResultIds = [...seen].sort();
  if (actualResultIds.join("\n") !== expectedResultIds.join("\n")) {
    throw new Error("Production results must contain exactly one result for every accepted unit.");
  }
  return Object.freeze(validated.sort((left, right) => left.unitId.localeCompare(right.unitId)));
}

function indexUnits(units: readonly ProductionUnit[], label: string): Map<string, ProductionUnit> {
  const indexed = new Map<string, ProductionUnit>();
  for (const unit of units) {
    if (!hasText(unit.id)) throw new Error(`${label} contains a production unit without an ID.`);
    if (indexed.has(unit.id)) throw new Error(`${label} contains duplicate production unit ${unit.id}.`);
    indexed.set(unit.id, unit);
  }
  return indexed;
}

function assertUnchangedUnitShape(planned: ReadonlyMap<string, ProductionUnit>, current: ReadonlyMap<string, ProductionUnit>): void {
  if (planned.size !== current.size) throw new Error("Current production units must retain every planned unit.");
  for (const [id, original] of planned) {
    const candidate = current.get(id);
    if (!candidate) throw new Error(`Current production units omit planned unit ${id}.`);
    if (
      candidate.route !== original.route
      || !sameStrings(candidate.requirementIds, original.requirementIds)
      || !sameStrings(candidate.dependencies, original.dependencies)
    ) {
      throw new Error(`Production result hand-off cannot change the route, requirements, or dependencies of ${id}.`);
    }
  }
}

function assertRequiredSourceKeys(
  sourcesByUnit: Readonly<Record<string, readonly string[]>> | undefined,
  units: ReadonlyMap<string, ProductionUnit>,
): void {
  if (!sourcesByUnit) return;
  for (const [unitId, sourceIds] of Object.entries(sourcesByUnit)) {
    if (!units.has(unitId)) throw new Error(`Required sources reference unknown production unit ${unitId}.`);
    if (!Array.isArray(sourceIds) || sourceIds.some((sourceId) => !hasText(sourceId))) {
      throw new Error(`Required sources for ${unitId} must be non-empty artifact IDs.`);
    }
  }
}

function assertResultShape(result: ProductionUnitAcceptanceResult): void {
  if (!hasText(result.unitId)) throw new Error("Production result requires unitId.");
  if (!hasText(result.provenanceNote)) throw new Error(`Production result ${result.unitId} requires a provenance note.`);
  if (!Number.isInteger(result.backendRevision) || result.backendRevision <= 0) {
    throw new Error(`Production result ${result.unitId} requires a positive backend revision.`);
  }
  if (!Array.isArray(result.acceptedArtifactRefs) || result.acceptedArtifactRefs.length === 0) {
    throw new Error(`Production result ${result.unitId} requires at least one accepted artifact reference.`);
  }
  const artifactIds = new Set<string>();
  for (const artifact of result.acceptedArtifactRefs) {
    if (!hasText(artifact.artifactId) || !hasText(artifact.kind) || !hasText(artifact.mediaType) || !hasText(artifact.contentHash) || !hasText(artifact.createdAt)) {
      throw new Error(`Production result ${result.unitId} contains an incomplete artifact reference.`);
    }
    if (!Number.isInteger(artifact.revision) || artifact.revision <= 0 || !Array.isArray(artifact.parentArtifactIds)) {
      throw new Error(`Production result ${result.unitId} contains an invalid artifact reference.`);
    }
    if (artifactIds.has(artifact.artifactId)) throw new Error(`Production result ${result.unitId} repeats artifact ${artifact.artifactId}.`);
    artifactIds.add(artifact.artifactId);
    if (artifact.parentArtifactIds.some((parentId: string) => !hasText(parentId))) {
      throw new Error(`Production result ${result.unitId} contains an invalid artifact parent reference.`);
    }
  }
}

function assertRequiredSources(result: ProductionUnitAcceptanceResult, requiredSourceArtifactIds: readonly string[]): void {
  const reachable = new Set<string>();
  for (const artifact of result.acceptedArtifactRefs) {
    reachable.add(artifact.artifactId);
    for (const parentId of artifact.parentArtifactIds) reachable.add(parentId);
  }
  for (const sourceId of requiredSourceArtifactIds) {
    if (!hasText(sourceId)) throw new Error(`Production result ${result.unitId} has an invalid required source ID.`);
    if (!reachable.has(sourceId)) {
      throw new Error(`Production result ${result.unitId} omits required source artifact ${sourceId}.`);
    }
  }
}

function immutableResult(result: ProductionUnitAcceptanceResult): ProductionUnitAcceptanceResult {
  const artifacts = result.acceptedArtifactRefs.map((artifact) => Object.freeze({
    ...artifact,
    parentArtifactIds: Object.freeze([...artifact.parentArtifactIds]),
  }));
  return Object.freeze({
    unitId: result.unitId,
    acceptedArtifactRefs: Object.freeze(artifacts),
    provenanceNote: result.provenanceNote,
    backendRevision: result.backendRevision,
  });
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
