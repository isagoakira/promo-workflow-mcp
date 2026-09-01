import type { ArticlePlatformBranch } from "./platform.js";

export const ARTICLE_BLOCK_TYPES = [
  "heading",
  "paragraph",
  "image",
  "quote",
  "callout",
  "code",
  "table",
  "divider",
  "cta",
] as const;

export type ArticleBlockType = (typeof ARTICLE_BLOCK_TYPES)[number];

export interface ArticleContentBlock {
  id: string;
  type: ArticleBlockType;
  content: string | null;
  assetId: string | null;
  sourceMasterRef: string;
}

export interface PlatformArticleDocument {
  id: string;
  revision: number;
  branch: ArticlePlatformBranch;
  blocks: readonly ArticleContentBlock[];
  createdAt: string;
}

export type ArticleAssetRoute =
  | "accepted"
  | "human"
  | "generative"
  | "local";

export interface ArticleAssetManifestItem {
  assetId: string;
  route: ArticleAssetRoute;
  sourceArtifactIds: readonly string[];
  evidenceRole: string;
  constraints: readonly string[];
}

export interface ArticleAssetManifest {
  documentRevision: number;
  items: readonly ArticleAssetManifestItem[];
}

export interface ArticleAssemblerReference {
  branchId: string;
  revision: number;
  parentMasterRevision: string;
  platform: string;
  platformProfileId: string;
  platformProfileVersion: string;
}

export interface ArticleProductionArtifacts {
  documentArtifactId: string;
  previewArtifactId: string;
  assetManifestArtifactId: string;
}
