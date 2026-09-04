import assert from "node:assert/strict";
import test from "node:test";

import { createGuidanceRequest, loadGuidance } from "../dist/index.js";

test("human-language guidance is a high-priority gate with actionable resources", () => {
  const request = createGuidanceRequest(["promo-writing-supervision", "human-language-writing"]);
  assert.deepEqual(request.policies.map((policy) => policy.id), ["human-language-writing", "promo-writing-supervision"]);
  assert.equal(request.policies[0].priority, "high");
  assert.equal(request.policies[0].plugin, "promo-human-language-writing");

  const [guide] = loadGuidance(["human-language-writing"]);
  assert.match(guide.content, /具体的人.*具体的处境/);
  assert.match(guide.content, /四类 AI 八股/);
  assert.deepEqual(guide.resources.map((resource) => resource.id), [
    "four-ai-cliches",
    "human-anchor-card",
    "human-language-repair",
    "promo-human-language-gate",
  ]);
});

test("APPSO style guidance is split by workflow node and keeps whole-style control", () => {
  const [contract, outline, manuscript, visualProof, preview, release] = loadGuidance([
    "product-tweet-article-contract",
    "product-tweet-human-center-outline",
    "product-tweet-manuscript-proof",
    "product-tweet-visual-proof",
    "product-tweet-preview-review",
    "product-tweet-release-packaging",
  ]);

  assert.match(contract.content, /编辑看见什么.*段落怎样呼吸/);
  assert.deepEqual(contract.resources.map((resource) => resource.id), [
    "appso-style-model",
    "style-control-capsule",
    "authorial-warmth",
    "evidence-standard",
  ]);
  assert.match(contract.resources[1].content, /articleEditorialIntent/);
  assert.equal(contract.resources.some((resource) => resource.id === "style-migration-protocol"), false);
  assert.equal(outline.resources.some((resource) => resource.id === "structure-and-proportion"), true);
  assert.equal(outline.resources.some((resource) => resource.id === "annotated-sample-cards"), true);
  assert.equal(manuscript.resources.some((resource) => resource.id === "style-migration-protocol"), true);
  assert.equal(manuscript.resources.some((resource) => resource.id === "style-similarity-audit"), true);
  assert.deepEqual(visualProof.resources.map((resource) => resource.id), ["structure-and-proportion", "evidence-standard", "voice-and-structure"]);
  assert.deepEqual(preview.resources.map((resource) => resource.id), ["appso-style-model", "style-control-capsule", "evidence-standard", "style-similarity-audit"]);
  assert.deepEqual(release.resources.map((resource) => resource.id), ["appso-style-model", "voice-and-structure", "style-similarity-audit"]);
  assert.match(contract.resources[2].content, /真实的人注意到了细节/);
  assert.match(manuscript.resources.find((resource) => resource.id === "style-migration-protocol").content, /宏观层.*中观层.*微观层/s);
  assert.match(preview.resources.find((resource) => resource.id === "style-similarity-audit").content, /编辑目光 20/);
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
