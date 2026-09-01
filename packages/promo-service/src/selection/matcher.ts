import { createHash } from "node:crypto";

import { createAgentWorkCapsule } from "../agent-work.js";
import type {
  FetchedTopic,
  ProductProfile,
  SelectionEngine,
  TopicCandidate,
  TopicFetchBrief,
  TopicMatchRun,
  TopicSource,
} from "./types.js";

const MAX_SOURCES = 10;
const MAX_FETCHED_TOPICS = 50;
const MAX_CANDIDATES = 3;

export class TopicMatchingEngine implements SelectionEngine {
  async run(context: Record<string, unknown>): Promise<TopicMatchRun> {
    const profile = readProductProfile(context.productProfile);
    const sources = readSources(context.topicSources);
    const topics = readFetchedTopics(context.fetchedTopics, sources);
    const candidates = topics
      .map((topic) => scoreTopic(topic, profile))
      .filter((candidate) => candidate.productFit > 0)
      .sort((left, right) => right.score - left.score || right.topicMomentum - left.topicMomentum)
      .slice(0, MAX_CANDIDATES);

    if (candidates.length === 0) {
      throw new Error("回填材料中没有与当前产品卡匹配的选题。请补充抓取范围或调整产品定位、能力和宣传口径。");
    }

    return {
      fetchedAt: new Date().toISOString(),
      sourceCount: sources.length,
      fetchedTopicCount: topics.length,
      candidates,
      warnings: [],
    };
  }
}

export function createFetchBrief(context: Record<string, unknown>): TopicFetchBrief {
  const profile = readProductProfile(context.productProfile);
  const sources = readSources(context.topicSources);
  return {
    ...createAgentWorkCapsule({
      stage: "topic_fetch",
      inputs: {
        productName: profile.productName,
        positioning: profile.positioning,
        capabilities: profile.capabilities,
        activeCampaignLines: profile.activeCampaignLines,
        recentMessaging: profile.recentMessaging ?? [],
        sources,
      },
      constraints: [
        "Preserve source URLs and publication time when available.",
        "Do not copy full pages or add unsupported claims.",
        "Collect at most five credible topic cards per source.",
      ],
      requestedOutput: {
        description: "Recent, source-preserving topic cards for local matching.",
        fields: ["sourceId", "title", "url", "excerpt", "publishedAt"],
      },
      validationRules: [
        "Each card must reference a configured sourceId.",
        "Each card must include a title and URL.",
        "Submit 1–50 cards with promo_commit(kind=submit_fetched_topics).",
      ],
      nextCommitKind: "submit_fetched_topics",
    }),
    productName: profile.productName,
    sources,
    queryHints: [
      profile.positioning,
      ...profile.capabilities,
      ...profile.activeCampaignLines,
      ...(profile.recentMessaging ?? []),
    ],
  };
}

function scoreTopic(topic: FetchedTopic, profile: ProductProfile): TopicCandidate {
  const corpus = `${topic.title} ${topic.excerpt}`.toLowerCase();
  const capability = matched(profile.capabilities, corpus);
  const campaign = matched(profile.activeCampaignLines, corpus);
  const messaging = matched(profile.recentMessaging ?? [], corpus);
  const positioning = hasTerms(profile.positioning, corpus);
  const audience = hasTerms(profile.targetAudience ?? "", corpus);
  const productFit = Math.round(Math.min(100, (
    coverage(capability, profile.capabilities) * 50
    + coverage(campaign, profile.activeCampaignLines) * 32
    + coverage(messaging, profile.recentMessaging ?? []) * 10
    + (positioning ? 6 : 0)
    + (audience ? 2 : 0)
  )));
  const topicMomentum = Math.round(Math.min(30, recency(topic.publishedAt) * 22 + topic.sourceWeight * 8));
  const score = Math.round(productFit * 0.8 + topicMomentum * 0.2);
  const rationale = [
    campaign.length ? `对应宣传口径：${campaign.join("；")}` : "",
    capability.length ? `可由产品能力承接：${capability.join("；")}` : "",
    messaging.length ? `延续近期表达：${messaging.join("；")}` : "",
    positioning ? "与产品定位直接相关" : "",
  ].filter(Boolean);

  return {
    topicId: `topic_${createHash("sha256").update(`${topic.url}|${topic.title}`).digest("hex").slice(0, 16)}`,
    title: topic.title,
    url: topic.url,
    source: topic.sourceLabel,
    excerpt: topic.excerpt,
    publishedAt: topic.publishedAt,
    score,
    productFit,
    topicMomentum,
    matchedCapabilities: capability,
    matchedCampaignLines: campaign,
    matchedRecentMessaging: messaging,
    rationale,
  };
}

function readProductProfile(value: unknown): ProductProfile {
  if (!isRecord(value)) throw new Error("选材需要 context.productProfile。");
  return {
    productName: requiredText(value.productName, "productProfile.productName"),
    positioning: requiredText(value.positioning, "productProfile.positioning"),
    capabilities: textList(value.capabilities, "productProfile.capabilities", 1),
    activeCampaignLines: textList(value.activeCampaignLines, "productProfile.activeCampaignLines", 2, 3),
    recentMessaging: optionalTextList(value.recentMessaging, "productProfile.recentMessaging", 3),
    targetAudience: optionalText(value.targetAudience, "productProfile.targetAudience"),
  };
}

function readSources(value: unknown): TopicSource[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SOURCES) {
    throw new Error(`选材需要 1–${MAX_SOURCES} 个 context.topicSources。`);
  }
  const ids = new Set<string>();
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`topicSources[${index}] 必须是对象。`);
    const id = requiredText(entry.id, `topicSources[${index}].id`);
    if (ids.has(id)) throw new Error(`topicSources 中的 id 不能重复：${id}。`);
    ids.add(id);
    const kind = entry.kind;
    if (kind !== "rss" && kind !== "html") throw new Error(`topicSources[${index}].kind 必须是 rss 或 html。`);
    const weight = entry.weight === undefined ? undefined : Number(entry.weight);
    if (weight !== undefined && (!Number.isFinite(weight) || weight < 0 || weight > 3)) {
      throw new Error(`topicSources[${index}].weight 必须在 0 到 3 之间。`);
    }
    return {
      id,
      url: requiredText(entry.url, `topicSources[${index}].url`),
      kind,
      label: optionalText(entry.label, `topicSources[${index}].label`),
      weight,
    };
  });
}

function readFetchedTopics(value: unknown, sources: TopicSource[]): FetchedTopic[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FETCHED_TOPICS) {
    throw new Error(`submit_fetched_topics 需要 1–${MAX_FETCHED_TOPICS} 张 context.fetchedTopics 材料卡。`);
  }
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`fetchedTopics[${index}] 必须是对象。`);
    const sourceId = requiredText(entry.sourceId, `fetchedTopics[${index}].sourceId`);
    const source = sourceById.get(sourceId);
    if (!source) throw new Error(`fetchedTopics[${index}] 引用了未配置的 sourceId：${sourceId}。`);
    return {
      sourceId,
      sourceLabel: source.label ?? source.id,
      sourceWeight: source.weight ?? 1,
      title: requiredText(entry.title, `fetchedTopics[${index}].title`),
      url: requiredText(entry.url, `fetchedTopics[${index}].url`),
      excerpt: optionalText(entry.excerpt, `fetchedTopics[${index}].excerpt`) ?? "",
      publishedAt: optionalDate(entry.publishedAt, `fetchedTopics[${index}].publishedAt`),
    };
  });
}

function matched(values: string[], corpus: string): string[] {
  return values.filter((value) => hasTerms(value, corpus));
}

function hasTerms(value: string, corpus: string): boolean {
  const terms = termsFor(value);
  const requiredHits = terms.length === 1 ? 1 : 2;
  return terms.filter((term) => corpus.includes(term)).length >= requiredHits;
}

function termsFor(value: string): string[] {
  const normalized = value.toLowerCase();
  const english = normalized.match(/[a-z0-9][a-z0-9+._-]{2,}/g) ?? [];
  const chineseRuns = normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  const chinese = chineseRuns.flatMap((run) => {
    if (run.length <= 4) return [run];
    const fragments = [run];
    for (let index = 0; index <= run.length - 3; index += 1) fragments.push(run.slice(index, index + 3));
    return fragments;
  });
  return [...new Set([...english, ...chinese])];
}

function coverage(matches: string[], total: string[]): number {
  return total.length === 0 ? 0 : matches.length / total.length;
}

function recency(value: string | undefined): number {
  if (!value) return 0.3;
  const ageDays = Math.max(0, (Date.now() - new Date(value).valueOf()) / 86_400_000);
  return Math.exp(-ageDays / 10);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} 必须是非空文本。`);
  return value.trim();
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredText(value, field);
}

function textList(value: unknown, field: string, minimum: number, maximum = 20): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new Error(`${field} 必须包含 ${minimum}–${maximum} 条文本。`);
  }
  return value.map((item, index) => requiredText(item, `${field}[${index}]`));
}

function optionalTextList(value: unknown, field: string, maximum: number): string[] | undefined {
  if (value === undefined) return undefined;
  return textList(value, field, 1, maximum);
}

function optionalDate(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  const raw = requiredText(value, field);
  const date = new Date(raw);
  if (Number.isNaN(date.valueOf())) throw new Error(`${field} 必须是可解析的日期。`);
  return date.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
