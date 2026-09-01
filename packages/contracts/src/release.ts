export interface ReleaseTitleCandidate {
  id: string;
  title: string;
}

export interface ReleaseCoverCandidate {
  id: string;
  artifactId: string;
  sourceArtifactIds: readonly string[];
}

export interface ReleaseReviewAction {
  id: string;
  instruction: string;
}

interface BasePackagingCapsule {
  state: "PACKAGING";
  titleCandidates: readonly ReleaseTitleCandidate[];
  coverCandidates: readonly ReleaseCoverCandidate[];
  pendingAction: ReleaseReviewAction;
}

export interface VideoPackagingCapsule extends BasePackagingCapsule {
  carrier: "video";
  introductionDraft: string;
}

export interface ArticlePackagingCapsule extends BasePackagingCapsule {
  carrier: "article";
  platform: string;
  productionRevision: number;
  summaryDraft: string;
}

export type PackagingCapsule =
  | VideoPackagingCapsule
  | ArticlePackagingCapsule;

export interface VideoReleasePackage {
  carrier: "video";
  title: string;
  coverArtifactId: string;
  introduction: string;
}

export interface ArticleReleasePackage {
  carrier: "article";
  title: string;
  coverArtifactId: string;
  summary: string;
  platform: string;
  productionRevision: number;
  finalPreviewArtifactId: string;
}

export type ReleasePackage = VideoReleasePackage | ArticleReleasePackage;

export interface VideoReleaseReadyCapsule {
  state: "RELEASE_READY";
  carrier: "video";
  release: VideoReleasePackage;
  confirmedAt: string;
}

export interface ArticleReleaseReadyCapsule {
  state: "RELEASE_READY";
  carrier: "article";
  release: ArticleReleasePackage;
  confirmedAt: string;
}

export type ReleaseReadyCapsule =
  | VideoReleaseReadyCapsule
  | ArticleReleaseReadyCapsule;

export type ReleaseCapsule = PackagingCapsule | ReleaseReadyCapsule;

export interface VideoReleaseSelectionCommit {
  kind: "select_release_package";
  carrier: "video";
  actionId: string;
  titleCandidateId: string;
  coverCandidateId: string;
  introduction: string;
}

export interface ArticleReleaseSelectionCommit {
  kind: "select_release_package";
  carrier: "article";
  actionId: string;
  titleCandidateId: string;
  coverCandidateId: string;
  summary: string;
}

export type ReleaseSelectionCommit =
  | VideoReleaseSelectionCommit
  | ArticleReleaseSelectionCommit;
