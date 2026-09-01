import assert from "node:assert/strict";
import test from "node:test";

import {
  UnavailableCutWorkbenchBridge,
  runCutWorkbenchBridge,
} from "../dist/cut-workbench-bridge.js";

const input = {
  lockedMaster: {
    topicId: "topic_1",
    budget: {
      carrier: "video",
      tier: "short",
      targetMinutes: 2,
      targetDurationSeconds: 120,
      beatRange: [4, 4],
      targetGrillQuestionRange: [2, 3],
    },
    master: {
      carrier: "video",
      workingTitle: "A repeatable rerun",
      targetDurationSeconds: 120,
      shots: [],
      primaryCallToAction: null,
      assetPlan: { sourceAssets: [], usages: [], uniqueAcquisitionCount: 0, plannedUsageCount: 0, oneOffAssetIds: [] },
    },
    confirmedAt: "2026-09-01T00:00:00.000Z",
  },
  requirementSet: { schemaVersion: 1, carrier: "video", inputUsageIds: [], requirements: [], subtitles: { cues: [], srt: "" } },
  acceptedProductionResults: [{ unitId: "unit_1", artifactIds: ["artifact_broll_1"], provenance: "Human-shot and accepted in Promo." }],
};

test("the default bridge reports a capability gap and never fabricates a project", async () => {
  const result = await runCutWorkbenchBridge(new UnavailableCutWorkbenchBridge(), input);
  assert.deepEqual(result, {
    kind: "capability_gap",
    capability: "cut_workbench",
    reason: "No compatible Cut Workbench bridge is configured; its local/API interface has not been verified for this installation.",
    remediation: "Configure a compatible local Cut Workbench bridge before starting video production.",
  });
  assert.equal("projectId" in result, false);
});

test("a dependency-free fake can return the narrow verified production contract", async () => {
  const fakeBridge = {
    async run(receivedInput) {
      assert.equal(receivedInput, input);
      return {
        kind: "production_result",
        projectId: "cwb_project_1",
        revision: 2,
        unitStatuses: [{ unitId: "unit_1", status: "accepted" }],
        verifiedOutputArtifactIds: ["artifact_final_video_1"],
        finalSubtitleArtifactId: "artifact_final_srt_1",
        finalGate: { passed: true, blockers: [], verifiedAt: "2026-09-01T00:03:00.000Z" },
      };
    },
  };

  const result = await runCutWorkbenchBridge(fakeBridge, input);
  assert.equal(result.kind, "production_result");
  if (result.kind === "production_result") {
    assert.equal(result.projectId, "cwb_project_1");
    assert.equal(result.finalGate.passed, true);
  }
});

test("a bridge cannot pass the final gate without verified outputs and final subtitles", async () => {
  const unsafeBridge = {
    async run() {
      return {
        kind: "production_result",
        projectId: "cwb_project_unsafe",
        revision: 1,
        unitStatuses: [{ unitId: "unit_1", status: "accepted" }],
        verifiedOutputArtifactIds: [],
        finalSubtitleArtifactId: null,
        finalGate: { passed: true, blockers: [], verifiedAt: "2026-09-01T00:03:00.000Z" },
      };
    },
  };

  await assert.rejects(() => runCutWorkbenchBridge(unsafeBridge, input), /final subtitle artifact ID/);
});
