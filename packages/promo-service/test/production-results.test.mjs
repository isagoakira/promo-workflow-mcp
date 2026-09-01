import assert from "node:assert/strict";
import test from "node:test";

import { validateProductionResults } from "../dist/production-results.js";

const plannedUnits = [
  { id: "unit_capture", requirementIds: ["req_capture"], route: "human", status: "waiting_human", dependencies: [] },
  { id: "unit_transition", requirementIds: ["req_transition"], route: "generative", status: "queued", dependencies: ["unit_capture"] },
];

function artifact(artifactId, parents = []) {
  return {
    artifactId,
    kind: "preview",
    mediaType: "application/json",
    contentHash: `${artifactId}-hash`,
    revision: 1,
    createdAt: "2026-09-01T00:00:00.000Z",
    parentArtifactIds: parents,
  };
}

test("acceptance results preserve the plan, lineage, and immutable result shape", () => {
  const currentUnits = [
    { ...plannedUnits[0], status: "accepted" },
    { ...plannedUnits[1], status: "active" },
  ];
  const results = validateProductionResults({
    plannedUnits,
    currentUnits,
    requiredSourceArtifactIdsByUnit: { unit_capture: ["artifact_capture_source"] },
    results: [{
      unitId: "unit_capture",
      acceptedArtifactRefs: [artifact("artifact_capture_output", ["artifact_capture_source"])],
      provenanceNote: "Verified capture from the approved product build.",
      backendRevision: 3,
    }],
  });
  assert.equal(results[0]?.unitId, "unit_capture");
  assert.equal(Object.isFrozen(results), true);
  assert.equal(Object.isFrozen(results[0]?.acceptedArtifactRefs), true);
  assert.equal(Object.isFrozen(results[0]?.acceptedArtifactRefs[0]?.parentArtifactIds), true);
});

test("rejects unknown, non-accepted, or incomplete results", () => {
  assert.throws(() => validateProductionResults({
    plannedUnits,
    currentUnits: plannedUnits,
    results: [{ unitId: "unit_unknown", acceptedArtifactRefs: [artifact("artifact_1")], provenanceNote: "note", backendRevision: 1 }],
  }), /unknown unit/);
  assert.throws(() => validateProductionResults({
    plannedUnits,
    currentUnits: plannedUnits,
    results: [{ unitId: "unit_capture", acceptedArtifactRefs: [artifact("artifact_1")], provenanceNote: "note", backendRevision: 1 }],
  }), /requires an accepted unit/);
  assert.throws(() => validateProductionResults({
    plannedUnits,
    currentUnits: [{ ...plannedUnits[0], status: "accepted" }, plannedUnits[1]],
    results: [{ unitId: "unit_capture", acceptedArtifactRefs: [], provenanceNote: "note", backendRevision: 1 }],
  }), /at least one accepted artifact/);
});

test("rejects structural mutations, omitted accepted results, and missing required provenance", () => {
  assert.throws(() => validateProductionResults({
    plannedUnits,
    currentUnits: [{ ...plannedUnits[0], route: "generative" }, plannedUnits[1]],
    results: [],
  }), /cannot change the route/);
  assert.throws(() => validateProductionResults({
    plannedUnits,
    currentUnits: plannedUnits.map((unit) => ({ ...unit, status: "accepted" })),
    results: [{ unitId: "unit_capture", acceptedArtifactRefs: [artifact("artifact_1")], provenanceNote: "note", backendRevision: 1 }],
  }), /exactly one result/);
  assert.throws(() => validateProductionResults({
    plannedUnits,
    currentUnits: [{ ...plannedUnits[0], status: "accepted" }, plannedUnits[1]],
    requiredSourceArtifactIdsByUnit: { unit_capture: ["artifact_required_source"] },
    results: [{ unitId: "unit_capture", acceptedArtifactRefs: [artifact("artifact_1")], provenanceNote: "note", backendRevision: 1 }],
  }), /omits required source artifact/);
});
