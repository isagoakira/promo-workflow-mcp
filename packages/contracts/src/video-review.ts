/** Coordinates are normalized to the video picture, excluding player letterboxing. */
export interface VideoRegion { x: number; y: number; width: number; height: number }
/** A point has startMs === endMs. Multiple selections belong to one comment. */
export interface VideoSelection { startMs: number; endMs: number; region?: VideoRegion }
export interface VideoPreview {
  previewId: string; artifactId: string; sha256: string; locator: string;
  durationMs: number; sourceRevision: number; planVersion: string;
}
export interface VideoAnnotation {
  id: string; revision: number; previewId: string; selections: VideoSelection[];
  text: string; intent: "production_change" | "planning_change"; unitIds: string[];
  status: "open" | "addressed" | "resolved"; createdAt: string; updatedAt: string;
  targetPreviewId?: string; reply?: string;
}
export interface VideoReviewState {
  previews: VideoPreview[]; currentPreviewId: string | null; annotations: VideoAnnotation[];
  history: VideoAnnotation[];
}
export interface VideoReviewSnapshot extends VideoReviewState { workflowId: string; revision: number }
