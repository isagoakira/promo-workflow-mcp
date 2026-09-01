export type PlatformConstraintKind = "hard" | "soft";

export interface PlatformProfileSource {
  reference: string;
  checkedAt: string;
}

export interface PlatformConstraint {
  id: string;
  kind: PlatformConstraintKind;
  rule: string;
}

export interface PlatformRenderPreset {
  id: string;
  mode: "preview_analogue";
  description: string;
}

export interface PlatformProfile {
  id: string;
  platform: string;
  version: string;
  constraints: readonly PlatformConstraint[];
  renderPreset: PlatformRenderPreset;
  sources: readonly PlatformProfileSource[];
  updatedAt: string;
}

export interface ArticlePlatformBranch {
  id: string;
  parentMasterRevision: string;
  platform: string;
  platformProfileId: string;
  platformProfileVersion: string;
  createdAt: string;
}
