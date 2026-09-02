import type { WorkflowState } from "@promo-workflow/contracts";
import type { AgentWorkCapsule } from "./agent-work.js";
import type { ArtifactRef } from "./artifacts/types.js";
import type { BaselineProposal } from "./baseline.js";
import type { WorkspaceDeliverableRef } from "./workspace-deliverables.js";
import type { TopicFetchBrief, TopicMatchRun } from "./selection/types.js";

export type WorkflowCarrier = "video" | "article";

export type WorkflowEventKind =
  | "workflow_created"
  | "fetched_topics_submitted"
  | "automatic_step"
  | "topic_selected"
  | "baseline_proposed"
  | "baseline_grill_answered"
  | "baseline_locked"
  | "creative_routes_proposed"
  | "creative_route_selected"
  | "outline_draft_submitted"
  | "outline_grill_answered"
  | "outline_locked"
  | "master_draft_submitted"
  | "master_grill_answered"
  | "master_locked"
  | "production_units_updated"
  | "production_locked"
  | "release_package_submitted"
  | "release_locked"
  | "note_saved";

export interface WorkflowEvent {
  id: string;
  kind: WorkflowEventKind;
  state: WorkflowState;
  revision: number;
  at: string;
  summary: string;
}

export interface WorkflowRecord {
  id: string;
  carrier: WorkflowCarrier;
  state: WorkflowState;
  revision: number;
  createdAt: string;
  updatedAt: string;
  summary: string;
  context: Record<string, unknown>;
  events: WorkflowEvent[];
  idempotency: Record<string, WorkflowSnapshot>;
}

export interface PendingAction {
  id: string;
  kind: "run" | "commit" | "agent_work";
  instruction: string;
}

export interface WorkflowSnapshot {
  workflowId: string;
  carrier: WorkflowCarrier;
  state: WorkflowState;
  revision: number;
  updatedAt: string;
  summary: string;
  agentWork?: AgentWorkCapsule | undefined;
  fetchBrief?: TopicFetchBrief | undefined;
  topicMatch?: TopicMatchRun | undefined;
  baselineProposal?: BaselineProposal | undefined;
  baselineGrillCount?: number | undefined;
  deliverables: readonly WorkspaceDeliverableRef[];
  status: {
    node: number;
    label: string;
    userFacingState: string;
  };
  artifactRefs: ArtifactRef[];
  pendingAction: PendingAction | null;
}

export interface WorkflowStoreData {
  schemaVersion: 1;
  workflows: Record<string, WorkflowRecord>;
}
