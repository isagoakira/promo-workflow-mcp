import assert from "node:assert/strict";
import test from "node:test";

import { renderManuscript } from "../dist/manuscript-render.js";

test("renders a document-leading H1 matching master title only once", () => {
  const rendered = renderManuscript({
    title: "Memory 也该有自己的位置",
    bodyMarkdown: "# Memory 也该有自己的位置\n\n正文从这里开始。\n\n# 同名不是标题\n\n这是一处后续段落标题。",
    assetPlacements: [],
    primaryCallToAction: null,
  }, "artifact-master", "content-hash");

  assert.equal((rendered.html.match(/<h1/g) ?? []).length, 2, "only the document-leading duplicate must be suppressed");
  assert.match(rendered.html, /<h1 data-source-block="title">Memory 也该有自己的位置<\/h1>/);
  assert.doesNotMatch(rendered.html, /data-source-lines="1-1"/);
  assert.match(rendered.html, /data-source-lines="5-5"><h1>同名不是标题<\/h1>/);
});

test("keeps tilde-fenced shell content ahead of the next Markdown heading", () => {
  const rendered = renderManuscript({
    title: "接入指南",
    bodyMarkdown: "# 接入指南\n\n~~~bash\ndsh plugin add dsh-timem-memory\n# 这是一行 shell 注释\n~~~\n\n## 如需从仓库安装开发版\n\n继续说明。",
    assetPlacements: [],
    primaryCallToAction: null,
  }, "artifact-master", "content-hash");

  const codeAt = rendered.html.indexOf("dsh plugin add dsh-timem-memory");
  const headingAt = rendered.html.indexOf("如需从仓库安装开发版");
  assert.ok(codeAt >= 0);
  assert.ok(headingAt > codeAt, "the heading must render after its fenced shell block");
  assert.match(rendered.html, /<pre><code>dsh plugin add dsh-timem-memory\n# 这是一行 shell 注释<\/code><\/pre>/);
  assert.match(rendered.html, /<h2>如需从仓库安装开发版<\/h2>/);
});
