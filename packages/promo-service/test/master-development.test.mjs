import assert from "node:assert/strict";
import test from "node:test";

import {
  createMasterDevelopmentBrief,
  readMasterDraft,
  validateMasterDraft,
} from "../dist/master-development.js";

const sharedPlan = {
  sourceAssets: [{
    id: "source-demo",
    purpose: "Show the product operating in its real interface.",
    evidenceRole: "product evidence",
    productionIntent: "Record one complete product walkthrough.",
    captureProtocol: { captureMode: "capture", continuousPath: "Open the real product, complete the walkthrough, hold the result.", requiredVisibleStates: ["initial state", "completed result"], editingHandles: "Hold each key state for 3 seconds before and after the action.", backupStrategy: "Record a primary and backup walkthrough." },
    constraints: ["Do not imply features outside the captured build."],
    preferredRoute: "screen-recording",
    reusableFragments: [
      { id: "fragment-start", sourceAssetId: "source-demo", extraction: "opening state", transformation: null },
      { id: "fragment-result", sourceAssetId: "source-demo", extraction: "result state", transformation: "crop for emphasis" },
    ],
    usageIds: ["usage-1", "usage-2"],
    essentialOneOffReason: null,
  }],
  usages: [
    { id: "usage-1", carrier: "video", targetId: "S01", purpose: "Establish the problem", sourceAssetId: "source-demo", fragmentId: "fragment-start" },
    { id: "usage-2", carrier: "video", targetId: "S02", purpose: "Show the result", sourceAssetId: "source-demo", fragmentId: "fragment-result" },
  ],
  uniqueAcquisitionCount: 1,
  plannedUsageCount: 2,
  oneOffAssetIds: [],
};

test("creates a master-development Agent-work capsule", () => {
  const brief = createMasterDevelopmentBrief({
    creativeOutline: {
      topicId: "topic-1",
      budget: { carrier: "video", tier: "short", targetMinutes: 2, targetDurationSeconds: 120, beatRange: [4, 4], targetGrillQuestionRange: [2, 3] },
      creativeSpine: {},
      outline: { carrier: "video" },
      macroStyleReview: { skill: "geek-product-promo-writing", scope: "macro", passed: true, findings: [] },
      confirmedAt: "2026-09-01T00:00:00.000Z",
    },
    selectedMaterials: ["source-1"],
    productContext: { name: "Demo" },
  });
  assert.equal(brief.stage, "master_development");
  assert.equal(brief.nextCommitKind, "submit_master_draft");
  assert.equal(brief.guidance.router, "promo_guidance");
  assert.deepEqual(brief.guidance.policies.map((policy) => policy.id), ["human-language-writing", "promo-writing-supervision", "promo-storyboard-supervision", "product-voiceover-campaign", "promo-deliverable-exemplars"]);
  assert.match(brief.constraints.join(" "), /storyboard/i);
});

test("parses and validates a continuous video storyboard with reused source material", () => {
  const draft = readMasterDraft({
    carrier: "video",
    workingTitle: "State control in action",
    targetDurationSeconds: 120,
    shots: [
      { id: "S01", timeRange: { startMs: 0, endMs: 60000 }, shotPurpose: "Set up the failure", spokenContent: "This is where workflows break.", spokenDelivery: "VO", recordingDirection: "Calm observation over the real failed screen.", sound: null, visualAction: "Show the stalled process.", composition: "Interface close-up", cameraBehavior: null, onScreenText: null, evidenceRefs: [], assetUsageIds: ["usage-1"], transition: "Cut on the problem." },
      { id: "S02", timeRange: { startMs: 60000, endMs: 120000 }, shotPurpose: "Resolve the failure", spokenContent: null, spokenDelivery: null, recordingDirection: null, sound: "Soft confirmation tone", visualAction: "Show the stateful result.", composition: "Result fills frame", cameraBehavior: null, onScreenText: "State retained", evidenceRefs: ["source-1"], assetUsageIds: ["usage-2"], transition: null },
    ],
    primaryCallToAction: "Try the controlled workflow.",
    assetPlan: sharedPlan,
  });

  const result = validateMasterDraft(draft, {
    budget: { carrier: "video", tier: "short", targetMinutes: 2, targetDurationSeconds: 120, beatRange: [4, 4], targetGrillQuestionRange: [2, 3] },
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.passed, true);
});

test("rejects gaps and unqualified one-off sources", () => {
  const draft = readMasterDraft({
    carrier: "video",
    workingTitle: "Broken plan",
    targetDurationSeconds: 120,
    shots: [
      { id: "S01", timeRange: { startMs: 0, endMs: 50000 }, shotPurpose: "Opening", spokenContent: null, spokenDelivery: null, recordingDirection: null, sound: null, visualAction: "Open", composition: "Wide", cameraBehavior: null, onScreenText: null, evidenceRefs: [], assetUsageIds: ["usage-1"], transition: null },
      { id: "S02", timeRange: { startMs: 60000, endMs: 120000 }, shotPurpose: "Ending", spokenContent: null, spokenDelivery: null, recordingDirection: null, sound: null, visualAction: "Close", composition: "Wide", cameraBehavior: null, onScreenText: null, evidenceRefs: [], assetUsageIds: [], transition: null },
    ],
    primaryCallToAction: null,
    assetPlan: {
      ...sharedPlan,
      sourceAssets: [{ ...sharedPlan.sourceAssets[0], usageIds: ["usage-1"] }],
      usages: [sharedPlan.usages[0]],
      plannedUsageCount: 1,
    },
  });
  const result = validateMasterDraft(draft);
  assert.equal(result.passed, false);
  assert.match(result.errors.join("\n"), /start at 50000ms/);
  assert.match(result.errors.join("\n"), /essentialOneOffReason/);
});

test("validates article placement anchors and article usage links", () => {
  const bodyMarkdown = "# 一个真实的工作流\n\n用户不是需要更多演示，而是需要一次可复现的执行。\n\n这里展示状态保存后的结果。";
  const draft = readMasterDraft({
    carrier: "article",
    title: "把演示变成可复现流程",
    alternativeTitles: ["一次状态控制的实测", "工作流为什么会失忆"],
    bodyMarkdown,
    assetPlacements: [
      { id: "P01", anchor: "状态保存后的结果", assetUsageId: "usage-article", editorialPurpose: "Show the proof at the conclusion." },
    ],
    primaryCallToAction: "查看完整流程。",
    assetPlan: {
      sourceAssets: [{
        ...sharedPlan.sourceAssets[0],
        usageIds: ["usage-article"],
        essentialOneOffReason: "This is the unique final proof frame.",
      }],
      usages: [{ id: "usage-article", carrier: "article", targetId: "P01", purpose: "Show outcome", sourceAssetId: "source-demo", fragmentId: "fragment-result" }],
      uniqueAcquisitionCount: 1,
      plannedUsageCount: 1,
      oneOffAssetIds: ["source-demo"],
    },
  });
  const result = validateMasterDraft(draft);
  assert.deepEqual(result.errors, []);
});
