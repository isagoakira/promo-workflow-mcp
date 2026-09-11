import assert from "node:assert/strict";
import test from "node:test";

import { exportArticle } from "../dist/article-export.js";

test("exports a text-first Markdown handoff and a standalone HTML reference", () => {
  const output = exportArticle({
    carrier: "article",
    title: "Agent 的记忆不该断在对话里",
    bodyMarkdown: "## 先看到上下文\n\n这里是正文。\n\n```bash\ndsh plugin add dsh-timem-memory\n```",
    assetPlacements: [],
    primaryCallToAction: "去了解太忆空间。",
  }, "artifact-master", "source-hash");

  assert.match(output.markdown, /^# Agent 的记忆不该断在对话里/m);
  assert.match(output.markdown, /dsh plugin add dsh-timem-memory/);
  assert.match(output.markdown, /去了解太忆空间。/);
  assert.match(output.html, /^<!doctype html>/i);
  assert.match(output.html, /<style>/);
  assert.match(output.html, /data-source-artifact="artifact-master"/);
  assert.match(output.html, /dsh plugin add dsh-timem-memory/);
  assert.match(output.feishuHtml, /^<div style="max-width:720px/);
  assert.match(output.feishuHtml, /border-left:4px solid #c85432/);
  assert.doesNotMatch(output.feishuHtml, /<style>/);
});

test("does not duplicate a matching document title in Markdown", () => {
  const output = exportArticle({
    carrier: "article",
    title: "已经写在正文里的标题",
    bodyMarkdown: "# 已经写在正文里的标题\n\n正文。",
    assetPlacements: [],
    primaryCallToAction: null,
  }, "artifact-master", "source-hash");
  assert.equal((output.markdown.match(/^# 已经写在正文里的标题$/gm) ?? []).length, 1);
});
