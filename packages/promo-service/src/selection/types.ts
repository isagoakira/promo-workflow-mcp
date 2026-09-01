export type TopicSourceKind = "rss" | "html";

export interface TopicSource {
  id: string;
  url: string;
  kind: TopicSourceKind;
  label?: string | undefined;
  weight?: number | undefined;
}

export interface ProductProfile {
  productName: string;
  positioning: string;
  capabilities: string[];
  activeCampaignLines: string[];
  recentMessaging?: string[] | undefined;
  targetAudience?: string | undefined;
}

export interface FetchedTopic {
  sourceId: string;
  sourceLabel: string;
  title: string;
  url: string;
  excerpt: string;
  publishedAt?: string | undefined;
  sourceWeight: number;
}

export interface TopicFetchBrief extends AgentWorkCapsule {
  productName: string;
  sources: TopicSource[];
  queryHints: string[];
}

export interface TopicCandidate {
  topicId: string;
  title: string;
  url: string;
  source: string;
  excerpt: string;
  publishedAt?: string | undefined;
  score: number;
  productFit: number;
  topicMomentum: number;
  matchedCapabilities: string[];
  matchedCampaignLines: string[];
  matchedRecentMessaging: string[];
  rationale: string[];
}

export interface TopicMatchRun {
  fetchedAt: string;
  sourceCount: number;
  fetchedTopicCount: number;
  candidates: TopicCandidate[];
  warnings: string[];
}

export interface SelectionEngine {
  run(context: Record<string, unknown>): Promise<TopicMatchRun>;
}
import type { AgentWorkCapsule } from "../agent-work.js";
