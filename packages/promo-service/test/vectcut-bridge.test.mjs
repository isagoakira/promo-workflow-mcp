import assert from "node:assert/strict";
import test from "node:test";

import { VectCutHttpBridge, runVectCutBridge } from "../dist/index.js";

const input = {
  lockedMaster: {
    topicId: "topic-1",
    budget: { carrier: "video", tier: "short" },
    master: {
      carrier: "video",
      shots: [{ id: "S01", timeRange: { startMs: 0, endMs: 5000 }, assetUsageIds: ["usage-1"] }],
    },
    confirmedAt: "2026-09-01T00:00:00.000Z",
  },
  requirementSet: { carrier: "video", subtitles: { srt: "1\n00:00:00,000 --> 00:00:05,000\nHello\n" } },
  acceptedProductionResults: [{ unitId: "unit-1", artifactIds: ["asset-1"], provenance: "accepted" }],
  mediaSources: [{ usageId: "usage-1", videoUrl: "http://media.example/video.mp4" }],
};

test("VectCut HTTP bridge creates a timed editable draft, imports SRT, and saves", async () => {
  const requests = [];
  const responses = [
    { success: true, output: { draft_id: "draft-1", draft_url: "capcut://draft-1" } },
    { success: true, output: {} },
    { success: true, output: {} },
    { success: true, output: { draft_url: "capcut://draft-1" } },
  ];
  const bridge = new VectCutHttpBridge({
    baseUrl: "http://127.0.0.1:9001/",
    fetch: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  const result = await runVectCutBridge(bridge, input);
  assert.equal(result.kind, "draft_result");
  assert.equal(result.reference.draftId, "draft-1");
  assert.equal(result.subtitleImported, true);
  assert.deepEqual(result.importedUsageIds, ["usage-1"]);
  assert.deepEqual(requests.map((request) => request.url), [
    "http://127.0.0.1:9001/create_draft",
    "http://127.0.0.1:9001/add_video",
    "http://127.0.0.1:9001/add_subtitle",
    "http://127.0.0.1:9001/save_draft",
  ]);
  assert.deepEqual(requests[1].body, {
    draft_id: "draft-1", video_url: "http://media.example/video.mp4",
    start: 0, end: 5, target_start: 0, duration: 5,
  });
  assert.equal(requests[2].body.srt, input.requirementSet.subtitles.srt);
});

test("VectCut bridge rejects a locked timeline with an unmapped usage", async () => {
  const bridge = new VectCutHttpBridge({ baseUrl: "http://127.0.0.1:9001", fetch: async () => { throw new Error("must not fetch"); } });
  await assert.rejects(
    runVectCutBridge(bridge, { ...input, mediaSources: [] }),
    /requires a media source for locked usage usage-1/,
  );
});
