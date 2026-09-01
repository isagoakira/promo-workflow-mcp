import type {
  ArticleAssemblerReference,
  ArticleProductionArtifacts,
} from "./article-production.js";

export type ProductionRoute = "human" | "generative" | "local";

export type ProductionUnitStatus =
  | "queued"
  | "active"
  | "waiting_human"
  | "review"
  | "accepted"
  | "needs_replan";

export type ProductionActionKind =
  | "produce"
  | "approve"
  | "review"
  | "resolve";

export interface ProductionUnit {
  id: string;
  requirementIds: readonly string[];
  route: ProductionRoute;
  status: ProductionUnitStatus;
  dependencies: readonly string[];
}

export interface CutWorkbenchReference {
  projectId: string;
  revision: number;
}

export interface VectCutReference {
  draftId: string;
  draftUrl: string | null;
  revision: number;
}

export type VideoDeliveryMode = "final_video" | "editable_draft";

export interface PendingProductionAction {
  id: string;
  kind: ProductionActionKind;
  instruction: string;
}

interface BaseProducingCapsule {
  state: "PRODUCING";
  units: readonly ProductionUnit[];
  pendingAction: PendingProductionAction | null;
  blockers: readonly string[];
}

export interface VideoProducingCapsule extends BaseProducingCapsule {
  carrier: "video";
  backend: {
    kind: "cut_workbench";
    reference: CutWorkbenchReference;
  };
}

export interface ArticleProducingCapsule extends BaseProducingCapsule {
  carrier: "article";
  backend: {
    kind: "article_assembler";
    reference: ArticleAssemblerReference;
  };
}

export type ProducingCapsule =
  | VideoProducingCapsule
  | ArticleProducingCapsule;

export interface VideoProductionLockedCapsule {
  state: "PRODUCTION_LOCKED";
  carrier: "video";
  backend:
    | { kind: "cut_workbench"; reference: CutWorkbenchReference }
    | { kind: "vectcut"; reference: VectCutReference };
  outputArtifactIds: readonly string[];
  deliveryMode: VideoDeliveryMode;
  lockedAt: string;
}

export interface ArticleProductionLockedCapsule {
  state: "PRODUCTION_LOCKED";
  carrier: "article";
  backend: {
    kind: "article_assembler";
    reference: ArticleAssemblerReference;
  };
  outputArtifacts: ArticleProductionArtifacts;
  lockedAt: string;
}

export type ProductionLockedCapsule =
  | VideoProductionLockedCapsule
  | ArticleProductionLockedCapsule;

export type ProductionCapsule =
  | ProducingCapsule
  | ProductionLockedCapsule;

export interface ProductionActionCommit {
  kind: "production_action";
  actionId: string;
  response: string;
}
