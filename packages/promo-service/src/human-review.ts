import type { ArtifactStore } from "./artifacts/store.js";
import type { ArtifactKind, ArtifactRef } from "./artifacts/types.js";
import type { WorkflowEvent, WorkflowRecord } from "./types.js";

export interface HumanReviewPacket {
  schemaVersion: 1;
  workflowId: string;
  carrier: "video" | "article";
  requestedRevision: number;
  requestedAt: string;
  reason: string;
  requiredDecision: readonly ("approve" | "revise" | "reject")[];
  sections: Array<{
    node: number | "control";
    title: string;
    artifacts: ArtifactRef[];
  }>;
  events: WorkflowEvent[];
  markdown: string;
}

const SECTIONS: Array<{ node: number | "control"; title: string; kinds: readonly ArtifactKind[] }> = [
  { node: 1, title: "节点一：选材与证据", kinds: ["fetched_topic_cards", "topic_match", "selected_topic"] },
  { node: 2, title: "节点二：宣传意图", kinds: ["baseline"] },
  { node: 3, title: "节点三：创意路线与大纲", kinds: ["creative_routes", "creative_route_selection", "creative_outline_draft", "creative_outline", "outline_script"] },
  { node: 4, title: "节点四：主稿与审校", kinds: ["content_master_draft", "master_review", "content_master", "spoken_script", "recording_execution"] },
  { node: 5, title: "节点五：素材需求与前期执行", kinds: ["requirement_set", "preproduction_material_plan", "production_plan", "asset_plan", "subtitle"] },
  { node: "control", title: "决策、Grill 与候选竞争记录", kinds: ["decision_ledger", "competition_report"] },
];

/**
 * Freezes all passed upstream material into one reader-first packet. The
 * artifact is immutable; WorkspaceDeliverables separately projects markdown
 * to a stable review path for the human decision.
 */
export async function createHumanReviewPacket(input: {
  record: WorkflowRecord;
  artifacts: ArtifactStore;
  requestedRevision: number;
  reason: string;
}): Promise<HumanReviewPacket> {
  const refs = artifactRefs(input.record.context);
  const sections = SECTIONS.map((section) => ({
    node: section.node,
    title: section.title,
    artifacts: refs.filter((ref) => section.kinds.includes(ref.kind)),
  }));
  const markdownSections = await Promise.all(sections.map(async (section) => {
    const entries = await Promise.all(section.artifacts.map(async (ref) => {
      const record = await input.artifacts.read(ref.artifactId);
      return [
        `### ${ref.kind} · r${ref.revision}`,
        artifactMeta(ref),
        "```json",
        JSON.stringify(record.content, null, 2),
        "```",
      ].join("\n");
    }));
    return [
      `## ${section.title}`,
      entries.length > 0 ? entries.join("\n\n") : "本节点没有新增制品。",
    ].join("\n\n");
  }));

  const requestedAt = new Date().toISOString();
  const markdown = [
    "# 宣传工作流人工审核包",
    "",
    "## 审核元信息",
    `- 工作流：${input.record.id}`,
    `- 载体：${input.record.carrier}`,
    `- 冻结版本：r${input.requestedRevision}`,
    `- 触发原因：${input.reason}`,
    "- 待人工决策：批准进入制作 / 退回节点 2–5 修订 / 拒绝当前方案。",
    "- 约束：本包中的 agent_passed 不等于 human_approved；批准必须提交与此版本一致的 acceptedRevision。",
    "",
    "## 本轮推荐",
    `- ${input.record.summary}`,
    "",
    ...markdownSections,
    "",
    "## 事件与决策历史",
    "```json",
    JSON.stringify(input.record.events, null, 2),
    "```",
    "",
    "## 人工决定模板",
    "```json",
    JSON.stringify({
      kind: "submit_human_review",
      reviewArtifactId: "填写本审核包 artifactId",
      acceptedRevision: input.requestedRevision,
      decision: "approve | revise | reject",
      returnToNode: "仅 revise 时填写 2 | 3 | 4 | 5",
      comments: "必填：批准依据或退回修改要求",
    }, null, 2),
    "```",
    "",
  ].join("\n");

  return {
    schemaVersion: 1,
    workflowId: input.record.id,
    carrier: input.record.carrier,
    requestedRevision: input.requestedRevision,
    requestedAt,
    reason: input.reason,
    requiredDecision: ["approve", "revise", "reject"],
    sections,
    events: [...input.record.events],
    markdown,
  };
}

function artifactRefs(context: Record<string, unknown>): ArtifactRef[] {
  const value = context.artifactRefs;
  return Array.isArray(value) ? value.filter(isArtifactRef) : [];
}

function isArtifactRef(value: unknown): value is ArtifactRef {
  return typeof value === "object" && value !== null
    && typeof (value as ArtifactRef).artifactId === "string"
    && typeof (value as ArtifactRef).kind === "string";
}

function artifactMeta(ref: ArtifactRef): string {
  return `- artifactId: ${ref.artifactId}\n- hash: ${ref.contentHash}\n- createdAt: ${ref.createdAt}`;
}
