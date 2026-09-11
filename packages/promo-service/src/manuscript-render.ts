import type { ArticleManuscriptMaster } from "@promo-workflow/contracts";

/**
 * The reviewable, source-bound projection used before article production.
 * Markdown remains canonical; this object is deliberately an immutable view.
 */
export interface ManuscriptRender {
  schemaVersion: 1;
  renderer: "promo-md2html";
  renderProfile: "workbench";
  sourceArtifactId: string;
  sourceContentHash: string;
  title: string;
  stage?: "text" | "planned" | "release";
  html: string;
  blocks: readonly ManuscriptRenderBlock[];
}

export interface ManuscriptRenderBlock {
  id: string;
  kind: "heading" | "paragraph" | "quote" | "list" | "code" | "divider";
  sourceLineStart: number;
  sourceLineEnd: number;
}

export function renderManuscript(master: ArticleManuscriptMaster, sourceArtifactId: string, sourceContentHash: string): ManuscriptRender {
  const lines = master.bodyMarkdown.replace(/\r\n/g, "\n").split("\n");
  const firstContentLine = lines.findIndex(line => Boolean(line.trim()));
  const blocks: ManuscriptRenderBlock[] = [];
  const html: string[] = [`<article class="promo-article" data-source-artifact="${escapeHtml(sourceArtifactId)}">`, `<h1 data-source-block="title">${inline(master.title)}</h1>`];
  let paragraph: string[] = [];
  let paragraphStart = 0;
  let code: string[] | null = null;
  let codeStart = 0;
  let codeFence: "`" | "~" | null = null;
  let sequence = 0;
  const push = (kind: ManuscriptRenderBlock["kind"], start: number, end: number, body: string) => {
    sequence += 1;
    const id = `md-${sequence}`;
    blocks.push({ id, kind, sourceLineStart: start, sourceLineEnd: end });
    html.push(`<section class="promo-block promo-${kind}" data-source-block="${id}" data-source-lines="${start}-${end}">${body}</section>`);
  };
  const flushParagraph = (end: number) => {
    if (!paragraph.length) return;
    push("paragraph", paragraphStart, end, `<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const lineNumber = index + 1;
    const fence = /^(`{3,}|~{3,})\s*[^`~]*$/.exec(line.trim());
    if (code === null && fence) {
      flushParagraph(lineNumber - 1);
      code = [];
      codeStart = lineNumber;
      codeFence = fence[1]?.[0] === "~" ? "~" : "`";
      continue;
    }
    if (code !== null && codeFence && new RegExp(`^${codeFence === "~" ? "~" : "\\`"}{3,}\\s*$`).test(line.trim())) {
      push("code", codeStart, lineNumber, `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      code = null;
      codeFence = null;
      continue;
    }
    if (code !== null) { code.push(line); continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph(lineNumber - 1);
      const level = heading[1]?.length ?? 2;
      // The document title belongs to the master metadata. Authors often also
      // begin Markdown with the same H1; render it once while retaining every
      // other heading, including later repeated phrases.
      if (index === firstContentLine && level === 1 && sameTitle(heading[2] ?? "", master.title)) continue;
      push("heading", lineNumber, lineNumber, `<h${level}>${inline(heading[2] ?? "")}</h${level}>`);
      continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { flushParagraph(lineNumber - 1); push("divider", lineNumber, lineNumber, "<hr>"); continue; }
    if (/^>\s?/.test(line)) { flushParagraph(lineNumber - 1); push("quote", lineNumber, lineNumber, `<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`); continue; }
    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph(lineNumber - 1);
      const items = [line.replace(/^\s*[-*+]\s+/, "")];
      let end = lineNumber;
      while (index + 1 < lines.length && /^\s*[-*+]\s+/.test(lines[index + 1] ?? "")) { index += 1; end += 1; items.push((lines[index] ?? "").replace(/^\s*[-*+]\s+/, "")); }
      push("list", lineNumber, end, `<ul>${items.map(item => `<li>${inline(item)}</li>`).join("")}</ul>`);
      continue;
    }
    if (!line.trim()) { flushParagraph(lineNumber - 1); continue; }
    if (!paragraph.length) paragraphStart = lineNumber;
    paragraph.push(line.trim());
  }
  if (code !== null) push("code", codeStart, lines.length, `<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  flushParagraph(lines.length);
  if (master.primaryCallToAction) html.push(`<footer class="promo-cta">${inline(master.primaryCallToAction)}</footer>`);
  html.push("</article>");
  return { schemaVersion: 1, renderer: "promo-md2html", renderProfile: "workbench", sourceArtifactId, sourceContentHash, title: master.title, html: html.join("\n"), blocks };
}

/** Node 5 shows the same manuscript with actual-size material reservations. */
export function renderMaterialPreview(master: ArticleManuscriptMaster, sourceArtifactId: string, sourceContentHash: string, requirements: readonly { materialType: string; usages: readonly { usageId: string; purpose: string }[] }[]): ManuscriptRender {
  const base = renderManuscript(master, sourceArtifactId, sourceContentHash);
  let html = base.html;
  for (const placement of master.assetPlacements) {
    const requirement = requirements.find(item => item.usages.some(usage => usage.usageId === placement.assetUsageId));
    const anchor = escapeHtml(placement.anchor);
    const position = html.indexOf(anchor);
    if (position < 0) continue;
    const end = html.indexOf("</section>", position);
    if (end < 0) continue;
    const type = requirement?.materialType || "素材";
    const purpose = placement.editorialPurpose || requirement?.usages.find(usage => usage.usageId === placement.assetUsageId)?.purpose || "待补充说明";
    const ratio = /竖|portrait|手机|人物/i.test(type) ? "3 / 4" : "16 / 9";
    const placeholder = `<figure class="promo-material-placeholder" data-placement="${escapeHtml(placement.id)}" style="aspect-ratio:${ratio}"><figcaption><small>待插入素材 · ${escapeHtml(type)}</small><strong>${escapeHtml(purpose)}</strong><span>${escapeHtml(ratio)} 预留位</span></figcaption></figure>`;
    html = `${html.slice(0, end + 10)}${placeholder}${html.slice(end + 10)}`;
  }
  return { ...base, stage: "planned", html };
}

/** Node 7 adds the selected publishing package without modifying N6 content. */
export function renderReleasePreview(preview: { html: string }, sourceArtifactId: string, title: string, summary: string, coverArtifactId: string): ManuscriptRender {
  const header = `<header class="promo-release-header"><div class="promo-cover-wide"><small>头图 · 2.35:1</small><span>${escapeHtml(coverArtifactId)}</span></div><div class="promo-release-meta"><small>发布标题</small><h1>${inline(title)}</h1><p>${inline(summary)}</p><div class="promo-cover-square"><small>缩略图 · 1:1</small><span>${escapeHtml(coverArtifactId)}</span></div></div></header>`;
  return { schemaVersion: 1, renderer: "promo-md2html", renderProfile: "workbench", stage: "release", sourceArtifactId, sourceContentHash: "release-package", title, html: `<article class="promo-release">${header}${preview.html}</article>`, blocks: [] };
}

function sameTitle(markdownHeading: string, masterTitle: string): boolean {
  return markdownHeading.trim().replace(/\s+/g, " ") === masterTitle.trim().replace(/\s+/g, " ");
}

function inline(value: string): string {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
