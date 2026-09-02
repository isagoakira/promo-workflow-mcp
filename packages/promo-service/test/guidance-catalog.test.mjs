import assert from "node:assert/strict";
import test from "node:test";

import { loadGuidance } from "../dist/index.js";

test("exemplar guidance keeps project facts out while exposing stable deliverable anchors", () => {
  const [guide] = loadGuidance(["promo-deliverable-exemplars"]);

  assert.match(guide.content, /不是可照抄的案例模板/);
  assert.match(guide.content, /不得复用其中的产品名/);
  assert.equal(guide.resources.length, 5);
  assert.deepEqual(guide.resources.map((resource) => resource.id), [
    "storyboard",
    "recording-execution",
    "spoken-lines",
    "minimal-materials",
    "remaining-materials",
  ]);
  assert.match(guide.resources[0].content, /叙事任务 -> 镜头 -> 画面证据/);
  assert.match(guide.resources[3].content, /母素材 -> 可拆片段 -> 多个使用位/);
});
