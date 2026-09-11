import type { ArticleManuscriptMaster } from "@promo-workflow/contracts";

import { renderManuscript } from "./manuscript-render.js";

/**
 * Two portable projections of an article master. Markdown remains the useful
 * text-first handoff; HTML is a self-contained visual reference that can be
 * opened locally or copied into a rich-text editor without the workbench.
 */
export interface ArticleExport {
  markdown: string;
  html: string;
  /** Inline-styled fragment intended for rich-text clipboard handoff. */
  feishuHtml: string;
}

export function exportArticle(
  master: ArticleManuscriptMaster,
  sourceArtifactId: string,
  sourceContentHash: string,
): ArticleExport {
  const markdown = markdownExport(master);
  const rendered = renderManuscript(master, sourceArtifactId, sourceContentHash);
  return {
    markdown,
    html: standaloneHtml(master.title, rendered.html),
    feishuHtml: richTextHtml(rendered.html),
  };
}

function markdownExport(master: ArticleManuscriptMaster): string {
  const body = master.bodyMarkdown.replace(/\r\n/g, "\n").trim();
  const firstContent = body.split("\n").find(line => Boolean(line.trim())) ?? "";
  const hasTitle = new RegExp(`^#\\s+${escapeRegExp(master.title.trim())}\\s*$`).test(firstContent);
  const title = hasTitle ? "" : `# ${master.title.trim()}\n\n`;
  const cta = master.primaryCallToAction?.trim()
    ? `\n\n---\n\n${master.primaryCallToAction.trim()}`
    : "";
  return `${title}${body}${cta}\n`;
}

function standaloneHtml(title: string, articleHtml: string): string {
  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeHtml(title)}</title>`,
    "  <style>",
    "    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #1f2937; background: #f7f4ee; }",
    "    body { margin: 0; padding: 40px 18px 72px; }",
    "    .promo-article { box-sizing: border-box; max-width: 720px; margin: 0 auto; padding: clamp(28px, 6vw, 56px); background: #fffdf9; box-shadow: 0 18px 56px rgba(45, 37, 26, .10); }",
    "    h1, h2, h3 { color: #172033; letter-spacing: -.02em; }",
    "    h1 { margin: 0 0 36px; font-size: clamp(30px, 6vw, 44px); line-height: 1.22; }",
    "    h2 { margin: 44px 0 16px; font-size: 24px; line-height: 1.4; }",
    "    h3 { margin: 32px 0 12px; font-size: 19px; line-height: 1.45; }",
    "    p, li { font-size: 17px; line-height: 1.9; }",
    "    p { margin: 0 0 20px; }",
    "    ul { margin: 0 0 22px; padding-left: 1.35em; }",
    "    blockquote { margin: 26px 0; padding: 14px 18px; border-left: 3px solid #da5d35; color: #5d5048; background: #fbf4ed; }",
    "    pre { overflow-x: auto; padding: 18px; border-radius: 8px; background: #1d2430; color: #f8fafc; line-height: 1.65; }",
    "    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }",
    "    p code, li code { padding: .14em .35em; border-radius: 4px; background: #f1ede7; color: #a33c1f; }",
    "    a { color: #b44827; } hr { margin: 36px 0; border: 0; border-top: 1px solid #e7dfd3; }",
    "    .promo-cta { margin-top: 42px; padding: 18px; border-radius: 8px; background: #172033; color: #fff; font-size: 16px; line-height: 1.7; }",
    "  </style>",
    "</head>",
    "<body>",
    articleHtml,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/**
 * Feishu and similar editors sanitize document-level styles. Keep the useful
 * hierarchy in a fragment whose presentation travels with each element.
 */
function richTextHtml(articleHtml: string): string {
  return articleHtml
    .replace(/<article\b[^>]*>/, '<div style="max-width:720px;margin:0 auto;color:#222;font-family:PingFang SC,Microsoft YaHei,sans-serif;font-size:17px;line-height:1.9">')
    .replace(/<\/article>/, "</div>")
    .replace(/<section\b[^>]*>/g, '<div style="margin:0 0 22px">')
    .replace(/<\/section>/g, "</div>")
    .replace(/<h1([^>]*)>/g, '<h1$1 style="margin:0 0 30px;color:#172033;font-size:32px;line-height:1.35">')
    .replace(/<h2([^>]*)>/g, '<h2$1 style="margin:38px 0 14px;padding-left:10px;border-left:4px solid #c85432;color:#172033;font-size:24px;line-height:1.45">')
    .replace(/<h3([^>]*)>/g, '<h3$1 style="margin:30px 0 12px;color:#172033;font-size:20px;line-height:1.45">')
    .replace(/<p([^>]*)>/g, '<p$1 style="margin:0 0 20px;font-size:17px;line-height:1.9">')
    .replace(/<blockquote([^>]*)>/g, '<blockquote$1 style="margin:24px 0;padding:14px 18px;border-left:3px solid #0e5b73;background:#f4f7f6;color:#53605e">')
    .replace(/<pre([^>]*)>/g, '<pre$1 style="overflow-x:auto;margin:22px 0;padding:16px;border-radius:6px;background:#252b2b;color:#f4f1e7;line-height:1.65">')
    .replace(/<footer\b[^>]*>/g, '<div style="margin-top:36px;padding:16px;background:#fbdf5b;color:#172033;font-weight:700">')
    .replace(/<\/footer>/g, "</div>");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&#39;" })[char] ?? char);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
