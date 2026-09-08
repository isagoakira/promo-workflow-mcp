import { randomUUID } from "node:crypto";
import type { VideoAnnotation, VideoPreview, VideoReviewState, VideoSelection } from "@promo-workflow/contracts";

export function videoReviewFor(state?: VideoReviewState): VideoReviewState {
  return state ?? { previews: [], currentPreviewId: null, annotations: [], history: [] };
}
export function validateVideoPreview(preview: VideoPreview): void {
  for (const field of ["previewId", "artifactId", "locator", "planVersion"] as const) text(preview[field], field);
  if (!/^[a-f0-9]{64}$/i.test(preview.sha256)) throw new Error("Preview requires exact SHA-256.");
  if (!Number.isSafeInteger(preview.durationMs) || preview.durationMs <= 0) throw new Error("Invalid video duration.");
  if (!Number.isSafeInteger(preview.sourceRevision) || preview.sourceRevision < 1) throw new Error("Invalid source revision.");
}
export function mergeVideoPreviews(state: VideoReviewState, previews: readonly VideoPreview[], currentPreviewId: string | null): VideoReviewState {
  const merged = new Map(state.previews.map(p => [p.previewId, p]));
  for (const preview of previews) {
    validateVideoPreview(preview);
    const old = merged.get(preview.previewId);
    if (old && JSON.stringify(old) !== JSON.stringify(preview)) throw new Error("Immutable preview ID was reused with different video metadata.");
    merged.set(preview.previewId, structuredClone(preview));
  }
  if (currentPreviewId !== null && !merged.has(currentPreviewId)) throw new Error("Unknown current preview.");
  return { ...state, previews: [...merged.values()], currentPreviewId };
}
export function changeVideoAnnotation(state: VideoReviewState, input: Record<string, unknown>, allowedUnitIds: readonly string[]): VideoReviewState {
  const now = new Date().toISOString();
  let annotation: VideoAnnotation;
  if (input.action === "create") {
    const preview = state.previews.find(p => p.previewId === input.previewId);
    if (!preview || preview.sha256 !== input.sha256) throw new Error("Unknown or stale video version.");
    if (preview.previewId !== state.currentPreviewId) throw new Error("Select the current video before adding feedback; historical seconds cannot be remapped.");
    const selections = validateSelections(input.selections, preview.durationMs);
    if (input.intent !== "production_change" && input.intent !== "planning_change") throw new Error("Invalid feedback intent.");
    const unitIds = input.unitIds ?? [];
    if (!Array.isArray(unitIds) || unitIds.some(id => typeof id !== "string" || !allowedUnitIds.includes(id))) throw new Error("Unknown production unit.");
    annotation = { id: randomUUID(), revision: 1, previewId: preview.previewId, selections,
      text: text(input.text, "text"), intent: input.intent, unitIds: [...new Set(unitIds)], status: "open", createdAt: now, updatedAt: now };
  } else {
    const previous = state.annotations.find(a => a.id === input.annotationId);
    if (!previous || previous.revision !== input.expectedAnnotationRevision) throw new Error("Annotation revision conflict.");
    annotation = { ...previous, revision: previous.revision + 1, updatedAt: now };
    if (input.action === "address") {
      const target = state.previews.find(p => p.previewId === input.targetPreviewId);
      if (!target || target.previewId !== state.currentPreviewId || target.previewId === previous.previewId) throw new Error("Addressing feedback requires the current replacement preview.");
      if (previous.status !== "open") throw new Error("Only open feedback can be addressed.");
      annotation = { ...annotation, status: "addressed", targetPreviewId: target.previewId, reply: text(input.reply, "reply") };
    } else if (input.action === "resolve") {
      if (input.actor !== "human" || previous.status !== "addressed" || input.targetPreviewId !== previous.targetPreviewId || previous.targetPreviewId !== state.currentPreviewId) throw new Error("Human review of the current replacement video is required.");
      annotation.status = "resolved";
    } else if (input.action === "reopen") {
      if (input.actor !== "human") throw new Error("Reopening requires human feedback.");
      annotation.status = "open";
      delete annotation.targetPreviewId;
      delete annotation.reply;
    } else throw new Error("Unknown video annotation action.");
  }
  return { ...state, annotations: [...state.annotations.filter(a => a.id !== annotation.id), annotation], history: [...state.history, annotation] };
}
export function validateSelections(value: unknown, durationMs: number): VideoSelection[] {
  if (!Array.isArray(value) || !value.length || value.length > 32) throw new Error("Select 1–32 video points or ranges.");
  return value.map(raw => {
    const s = raw as VideoSelection;
    if (!s || !Number.isSafeInteger(s.startMs) || !Number.isSafeInteger(s.endMs) || s.startMs < 0 || s.endMs < s.startMs || s.endMs > durationMs) throw new Error("Selection is outside video duration.");
    const selection: VideoSelection = { startMs: s.startMs, endMs: s.endMs };
    if (s.region !== undefined) {
      const r = s.region;
      if (!r || ![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0 || r.x + r.width > 1 || r.y + r.height > 1) throw new Error("Video region must fit within normalized image bounds.");
      selection.region = { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    return selection;
  });
}
function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 10000) throw new Error(`${name} requires 1–10000 characters.`);
  return value;
}
