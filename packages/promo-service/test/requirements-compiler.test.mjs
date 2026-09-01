import assert from "node:assert/strict";
import test from "node:test";

import {
  compileRequirements,
  validateRequirementCoverage,
  validateSubtitles,
} from "../dist/requirements-compiler.js";

const videoUsages = [
  {
    usageId: "talk-hook",
    sourceAssetId: "host-cam-a",
    fragmentId: "take-03",
    materialType: "talking_head",
    purpose: "Open with the product tension",
    constraints: ["clean audio", "eye line to lens"],
    startMs: 0,
    endMs: 4200,
    spokenText: "Most product demos stop before the work begins.",
  },
  {
    usageId: "talk-proof",
    sourceAssetId: "host-cam-a",
    fragmentId: "take-07",
    materialType: "talking_head",
    purpose: "State the proof point",
    constraints: ["eye line to lens", "clean audio"],
    startMs: 6400,
    endMs: 9200,
    spokenText: "This workflow keeps every decision visible and versioned.",
  },
  {
    usageId: "ui-proof",
    sourceAssetId: "workflow-ui-capture",
    fragmentId: "match-screen",
    materialType: "screen_capture",
    purpose: "Show the material matching result",
    constraints: ["cursor visible"],
    startMs: 4200,
    endMs: 6400,
  },
];

test("compatible asset usages merge into a compact, auditable material requirement", () => {
  const result = compileRequirements({
    carrier: "video",
    videoDurationMs: 12_000,
    assetUsages: [...videoUsages].reverse(),
  });

  assert.equal(result.requirements.length, 2);
  const talkingHead = result.requirements.find((requirement) => requirement.sourceAssetId === "host-cam-a");
  assert.ok(talkingHead);
  assert.deepEqual(talkingHead.coverageUsageIds, ["talk-hook", "talk-proof"]);
  assert.equal(talkingHead.reuseCount, 2);
  assert.deepEqual(talkingHead.constraints, ["clean audio", "eye line to lens"]);
  assert.deepEqual(result.inputUsageIds, ["talk-hook", "talk-proof", "ui-proof"]);
});

test("video requirements derive ordered structured cues and exact SRT", () => {
  const result = compileRequirements({
    carrier: "video",
    videoDurationMs: 12_000,
    assetUsages: videoUsages,
  });

  assert.deepEqual(result.subtitles?.cues.map((cue) => cue.sourceUsageId), ["talk-hook", "talk-proof"]);
  assert.equal(
    result.subtitles?.srt,
    "1\n00:00:00,000 --> 00:00:04,200\nMost product demos stop before the work begins.\n\n2\n00:00:06,400 --> 00:00:09,200\nThis workflow keeps every decision visible and versioned.",
  );
});

test("coverage and subtitle guards reject missing coverage and invalid timing", () => {
  assert.throws(
    () => validateRequirementCoverage(
      [{ usageId: "one" }, { usageId: "two" }],
      [{ requirementId: "req-one", coverageUsageIds: ["one"] }],
    ),
    /not covered/,
  );
  assert.throws(
    () => compileRequirements({
      carrier: "video",
      videoDurationMs: 6_000,
      assetUsages: [{
        ...videoUsages[0],
        startMs: 5_000,
        endMs: 6_200,
      }],
    }),
    /exceeds video duration/,
  );
  assert.throws(
    () => validateSubtitles({
      cues: [
        { cueId: "cue-a", sourceUsageId: "a", startMs: 0, endMs: 2_000, text: "A" },
        { cueId: "cue-b", sourceUsageId: "b", startMs: 1_500, endMs: 3_000, text: "B" },
      ],
      srt: "",
    }, 4_000),
    /overlaps or precedes/,
  );
});

test("article requirements remain tool-neutral and do not emit subtitles", () => {
  const result = compileRequirements({
    carrier: "article",
    assetUsages: [{
      usageId: "hero-image",
      sourceAssetId: "product-ui-still",
      materialType: "product_image",
      purpose: "Ground the opening claim",
      oneOffJustification: "This unique interface state only appears once.",
    }],
  });

  assert.equal(result.subtitles, undefined);
  assert.equal(result.requirements[0]?.usages[0]?.oneOffJustification, "This unique interface state only appears once.");
});
