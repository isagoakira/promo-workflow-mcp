import assert from "node:assert/strict";
import test from "node:test";

import { loadGuidance } from "../dist/index.js";

test("article editor guidance is split by workflow artifact and retains authorial warmth", () => {
  const [contract, outline, manuscript, visualProof, preview, release] = loadGuidance([
    "appso-article-contract",
    "appso-human-center-outline",
    "appso-manuscript-proof",
    "appso-visual-proof",
    "appso-preview-review",
    "appso-release-packaging",
  ]);

  assert.match(contract.content, /人文中心/);
  assert.deepEqual(contract.resources.map((resource) => resource.id), ["authorial-warmth", "evidence-standard"]);
  assert.equal(outline.resources.some((resource) => resource.id === "annotated-sample-cards"), true);
  assert.deepEqual(manuscript.resources.map((resource) => resource.id), ["authorial-warmth", "evidence-standard", "voice-and-structure", "qa-scorecard"]);
  assert.deepEqual(visualProof.resources.map((resource) => resource.id), ["evidence-standard", "voice-and-structure"]);
  assert.equal(preview.resources.some((resource) => resource.id === "authorial-warmth"), true);
  assert.deepEqual(release.resources.map((resource) => resource.id), ["voice-and-structure", "qa-scorecard"]);
  assert.match(contract.resources[0].content, /真实的人注意到了细节/);
});

test("exemplar guidance keeps project facts out while exposing stable deliverable anchors", () => {
  const [guide] = loadGuidance(["promo-deliverable-exemplars"]);

  assert.match(guide.content, /完整、不可缩减的默认模板/);
  assert.match(guide.content, /不得复用案例中的产品名/);
  assert.equal(guide.resources.length, 6);
  assert.deepEqual(guide.resources.map((resource) => resource.id), [
    "video-delivery-contract",
    "outline-script",
    "storyboard",
    "recording-execution",
    "spoken-lines",
    "preproduction-material-plan",
  ]);
  assert.match(guide.resources[0].content, /大纲脚本/);
  assert.match(guide.resources[0].content, /前期素材执行包/);
  assert.match(guide.resources[0].content, /段落 ID → 镜头 ID → 台词 ID/);
  assert.match(guide.resources[1].content, /创意主线 -> 段落任务/);
  assert.match(guide.resources[2].content, /叙事任务 -> 镜头 -> 画面证据/);
  assert.match(guide.resources[5].content, /母素材 -> 可拆片段 -> 多个使用位/);
});
