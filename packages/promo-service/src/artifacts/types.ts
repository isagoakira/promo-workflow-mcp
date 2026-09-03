export type ArtifactKind =
  | "fetched_topic_cards"
  | "topic_match"
  | "selected_topic"
  | "baseline"
  | "decision_ledger"
  | "creative_routes"
  | "creative_route_selection"
  | "creative_outline_draft"
  | "creative_outline"
  | "outline_script"
  | "content_master_draft"
  | "master_review"
  | "content_master"
  | "spoken_script"
  | "recording_execution"
  | "asset_plan"
  | "requirement_set"
  | "human_review_packet"
  | "competition_report"
  | "preproduction_material_plan"
  | "subtitle"
  | "article_document"
  | "preview"
  | "asset_manifest"
  | "vectcut_draft"
  | "production_plan"
  | "production_checkpoint"
  | "production_handoff"
  | "production_locked"
  | "workspace_progress_audit"
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
