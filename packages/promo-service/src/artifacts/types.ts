export type ArtifactKind =
  | "fetched_topic_cards"
  | "topic_match"
  | "baseline"
  | "creative_outline_draft"
  | "creative_outline"
  | "content_master_draft"
  | "content_master"
  | "asset_plan"
  | "requirement_set"
  | "subtitle"
  | "article_document"
  | "preview"
  | "asset_manifest"
  | "vectcut_draft"
  | "production_plan"
  | "production_locked"
  | "release_package_draft"
  | "release_package";

export interface ArtifactRef {
  artifactId: string;
  kind: ArtifactKind;
  mediaType: string;
  contentHash: string;
  revision: number;
  createdAt: string;
  parentArtifactIds: string[];
}

export interface ArtifactRecord extends ArtifactRef {
  schemaVersion: 1;
  content: unknown;
}

export interface WriteArtifactInput {
  kind: ArtifactKind;
  content: unknown;
  mediaType?: string | undefined;
  parentArtifactIds?: string[] | undefined;
  revision?: number | undefined;
}
