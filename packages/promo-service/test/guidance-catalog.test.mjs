import assert from "node:assert/strict";
import test from "node:test";

import { loadGuidance } from "../dist/index.js";

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
