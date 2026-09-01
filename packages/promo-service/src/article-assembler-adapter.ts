import type {
  ArticleAssetManifest,
  ArticleAssetManifestItem,
  ArticleAssetRoute,
  ArticleAssemblerReference,
  ArticleContentBlock,
  ArticleManuscriptMaster,
  ArticlePlatformBranch,
  PlatformArticleDocument,
  PlatformProfile,
} from "@promo-workflow/contracts";

import {
  createArticleAssetManifest,
  createArticleDocument,
  renderArticlePreview,
  type ArticlePreviewAnalogue,
} from "./production.js";

/**
 * A concrete, reviewed material result for exactly one Node 4 article usage.
 * Its source artifacts are retained in the manifest; Promo does not need to
 * know whether the material came from a human, a generator, or a local step.
 */
export interface AcceptedArticleAssetResult {
  assetUsageId: string;
  assetId: string;
  route: ArticleAssetRoute;
  sourceArtifactIds: readonly string[];
}

export interface BuildArticleAssemblerOutputInput {
  /** Immutable Node 4 content master. */
  master: ArticleManuscriptMaster;
  /** Must be the locked master revision named by the branch. */
  masterArtifactId: string;
  platformProfile: PlatformProfile;
  branch: ArticlePlatformBranch;
  acceptedAssets: readonly AcceptedArticleAssetResult[];
  documentId: string;
  documentRevision: number;
  createdAt: string;
}

/** The three JSON-ready contents that the workflow later writes as artifacts. */
export interface ArticleAssemblerOutput {
  reference: ArticleAssemblerReference;
  document: PlatformArticleDocument;
  assetManifest: ArticleAssetManifest;
  preview: ArticlePreviewAnalogue;
}

/**
 * Builds the lightweight article backend output with no renderer or platform
 * API. Existing production primitives remain the single source of truth for
 * document, manifest, platform-profile, and preview validation.
 */
export function buildArticleAssemblerOutput(input: BuildArticleAssemblerOutputInput): ArticleAssemblerOutput {
  assertText(input.masterArtifactId, "masterArtifactId");
  if (input.branch.parentMasterRevision !== input.masterArtifactId) {
    throw new Error("Article branch parentMasterRevision must equal masterArtifactId.");
  }
  assertPositiveInteger(input.documentRevision, "documentRevision");
  assertText(input.documentId, "documentId");
  assertText(input.createdAt, "createdAt");

  const acceptedByUsageId = indexAcceptedAssets(input.acceptedAssets, input.master);
  const blocks = buildArticleBlocks(input.master, input.masterArtifactId, acceptedByUsageId);
  const document = createArticleDocument({
    id: input.documentId.trim(),
    revision: input.documentRevision,
    branch: input.branch,
    blocks,
    createdAt: input.createdAt.trim(),
  });
  const assetManifest = createArticleAssetManifest(
    document,
    buildManifestItems(input.master, acceptedByUsageId),
  );
  const preview = renderArticlePreview(document, input.platformProfile);

  return {
    reference: createArticleAssemblerReference(input.branch, input.documentRevision),
    document,
    assetManifest,
    preview,
  };
}

/** Builds the narrow, stable reference Promo stores in its production capsule. */
export function createArticleAssemblerReference(
  branch: ArticlePlatformBranch,
  revision: number,
): ArticleAssemblerReference {
  assertPositiveInteger(revision, "Article Assembler revision");
  assertText(branch.id, "Article branch id");
  assertText(branch.parentMasterRevision, "Article branch parentMasterRevision");
  assertText(branch.platform, "Article branch platform");
  assertText(branch.platformProfileId, "Article branch platformProfileId");
  assertText(branch.platformProfileVersion, "Article branch platformProfileVersion");
  return {
    branchId: branch.id.trim(),
    revision,
    parentMasterRevision: branch.parentMasterRevision.trim(),
    platform: branch.platform.trim(),
    platformProfileId: branch.platformProfileId.trim(),
    platformProfileVersion: branch.platformProfileVersion.trim(),
  };
}

function indexAcceptedAssets(
  results: readonly AcceptedArticleAssetResult[],
  master: ArticleManuscriptMaster,
): ReadonlyMap<string, AcceptedArticleAssetResult> {
  if (!Array.isArray(results)) throw new Error("acceptedAssets must be an array.");
  const usages = new Map(master.assetPlan.usages.map((usage) => [usage.id, usage]));
  const byUsageId = new Map<string, AcceptedArticleAssetResult>();
  const concreteAssetIds = new Set<string>();

  for (const result of results) {
    if (!isRecord(result)) throw new Error("acceptedAssets entries must be objects.");
    const assetUsageId = requiredText(result.assetUsageId, "acceptedAssets.assetUsageId");
    if (byUsageId.has(assetUsageId)) throw new Error(`Accepted assets contain duplicate usage ${assetUsageId}.`);
    const usage = usages.get(assetUsageId);
    if (!usage || usage.carrier !== "article") {
      throw new Error(`Accepted asset ${assetUsageId} does not map to an article master usage.`);
    }
    const assetId = requiredText(result.assetId, `accepted asset ${assetUsageId}.assetId`);
    if (concreteAssetIds.has(assetId)) {
      throw new Error(`Accepted assets must provide a distinct concrete assetId per placement; duplicate ${assetId}.`);
    }
    concreteAssetIds.add(assetId);
    const route = readRoute(result.route, `accepted asset ${assetUsageId}.route`);
    const sourceArtifactIds = readTextArray(result.sourceArtifactIds, `accepted asset ${assetUsageId}.sourceArtifactIds`);
    if (sourceArtifactIds.length === 0) throw new Error(`Accepted asset ${assetUsageId} needs at least one source artifact.`);
    if (new Set(sourceArtifactIds).size !== sourceArtifactIds.length) throw new Error(`Accepted asset ${assetUsageId} has duplicate source artifacts.`);
    byUsageId.set(assetUsageId, { assetUsageId, assetId, route, sourceArtifactIds });
  }

  for (const placement of master.assetPlacements) {
    if (!byUsageId.has(placement.assetUsageId)) {
      throw new Error(`Article placement ${placement.id} is missing an accepted asset for usage ${placement.assetUsageId}.`);
    }
  }
  if (byUsageId.size !== master.assetPlacements.length) {
    throw new Error("Accepted assets must correspond exactly to the article's asset placements.");
  }
  return byUsageId;
}

function buildArticleBlocks(
  master: ArticleManuscriptMaster,
  masterArtifactId: string,
  acceptedByUsageId: ReadonlyMap<string, AcceptedArticleAssetResult>,
): ArticleContentBlock[] {
  const textBlocks = markdownToBlocks(master.bodyMarkdown, masterArtifactId);
  const placementsByBlockIndex = new Map<number, ArticleContentBlock[]>();

  for (const placement of master.assetPlacements) {
    const blockIndex = textBlocks.findIndex((block) => (block.content ?? "").includes(placement.anchor));
    if (blockIndex < 0) {
      throw new Error(`Article placement ${placement.id} anchor does not occur in a renderable content block.`);
    }
    const accepted = acceptedByUsageId.get(placement.assetUsageId);
    if (!accepted) throw new Error(`Article placement ${placement.id} has no accepted asset.`);
    const imageBlock: ArticleContentBlock = {
      id: `asset_${placement.id}`,
      type: "image",
      content: placement.editorialPurpose,
      assetId: accepted.assetId,
      sourceMasterRef: `${masterArtifactId}:placement:${placement.id}`,
    };
    const blockPlacements = placementsByBlockIndex.get(blockIndex) ?? [];
    blockPlacements.push(imageBlock);
    placementsByBlockIndex.set(blockIndex, blockPlacements);
  }

  const blocks: ArticleContentBlock[] = [{
    id: "title",
    type: "heading",
    content: master.title,
    assetId: null,
    sourceMasterRef: `${masterArtifactId}:title`,
  }];
  for (const [index, block] of textBlocks.entries()) {
    blocks.push(block);
    blocks.push(...(placementsByBlockIndex.get(index) ?? []));
  }
  if (master.primaryCallToAction) {
    blocks.push({
      id: "primary_cta",
      type: "cta",
      content: master.primaryCallToAction,
      assetId: null,
      sourceMasterRef: `${masterArtifactId}:primary-cta`,
    });
  }
  return blocks;
}

function buildManifestItems(
  master: ArticleManuscriptMaster,
  acceptedByUsageId: ReadonlyMap<string, AcceptedArticleAssetResult>,
): ArticleAssetManifestItem[] {
  const sourcesById = new Map(master.assetPlan.sourceAssets.map((source) => [source.id, source]));
  return master.assetPlacements.map((placement) => {
    const usage = master.assetPlan.usages.find((candidate) => candidate.id === placement.assetUsageId);
    const accepted = acceptedByUsageId.get(placement.assetUsageId);
    if (!usage || !accepted) throw new Error(`Cannot build manifest for placement ${placement.id}.`);
    const source = sourcesById.get(usage.sourceAssetId);
    if (!source) throw new Error(`Article usage ${usage.id} has no source asset.`);
    return {
      assetId: accepted.assetId,
      route: accepted.route,
      sourceArtifactIds: [...accepted.sourceArtifactIds],
      evidenceRole: source.evidenceRole,
      constraints: [...source.constraints],
    };
  });
}

function markdownToBlocks(markdown: string, masterArtifactId: string): ArticleContentBlock[] {
  const lines = requiredText(markdown, "master.bodyMarkdown").replace(/\r\n/g, "\n").split("\n");
  const blocks: ArticleContentBlock[] = [];
  let paragraph: string[] = [];
  let code: string[] | undefined;
  let sequence = 0;

  const push = (type: ArticleContentBlock["type"], content: string | null): void => {
    sequence += 1;
    blocks.push({
      id: `body_${sequence}`,
      type,
      content,
      assetId: null,
      sourceMasterRef: `${masterArtifactId}:body:${sequence}`,
    });
  };
  const flushParagraph = (): void => {
    if (paragraph.length > 0) push("paragraph", paragraph.join("\n").trim());
    paragraph = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushParagraph();
      if (code === undefined) code = [];
      else {
        push("code", code.join("\n"));
        code = undefined;
      }
      continue;
    }
    if (code !== undefined) {
      code.push(line);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      push("heading", heading[2]?.trim() ?? "");
      continue;
    }
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      flushParagraph();
      push("divider", null);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushParagraph();
      push("quote", line.replace(/^>\s?/, "").trim());
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    paragraph.push(line.trim());
  }
  if (code !== undefined) throw new Error("master.bodyMarkdown has an unclosed code fence.");
  flushParagraph();
  return blocks;
}

function readRoute(value: unknown, field: string): ArticleAssetRoute {
  if (value === "accepted" || value === "human" || value === "generative" || value === "local") return value;
  throw new Error(`${field} must be accepted, human, generative, or local.`);
}

function readTextArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array.`);
  return value.map((item, index) => requiredText(item, `${field}[${index}]`));
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be non-empty text.`);
  return value.trim();
}

function assertText(value: unknown, field: string): asserts value is string {
  requiredText(value, field);
}

function assertPositiveInteger(value: unknown, field: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
