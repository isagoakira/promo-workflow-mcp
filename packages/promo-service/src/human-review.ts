import type { ArtifactStore } from "./artifacts/store.js";
import type { ArtifactKind, ArtifactRecord, ArtifactRef } from "./artifacts/types.js";
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
  { node: 2, title: "节点二：宣传意图", kinds: ["baseline_draft", "baseline"] },
  { node: 3, title: "节点三：创意路线与大纲", kinds: ["creative_routes", "creative_route_selection", "creative_outline_draft", "creative_outline", "outline_script"] },
  { node: 4, title: "节点四：主稿与审校", kinds: ["content_master_draft", "master_review", "content_master", "spoken_script", "recording_execution"] },
  { node: 5, title: "节点五：素材需求与前期执行", kinds: ["requirement_set", "preproduction_material_plan", "production_plan", "asset_plan", "subtitle"] },
  { node: "control", title: "决策、Grill 与候选竞争记录", kinds: ["decision_ledger", "competition_report", "workspace_progress_audit"] },
];

const KIND_TITLES: Partial<Record<ArtifactKind, string>> = {
  fetched_topic_cards: "来源材料卡",
  topic_match: "选题匹配结果",
  selected_topic: "已选题目",
  baseline_draft: "宣传意图草案",
  baseline: "已锁定宣传意图",
  decision_ledger: "决策记录",
  competition_report: "候选竞争报告",
  workspace_progress_audit: "工作区进度接续审计",
  creative_routes: "创意路线候选",
  creative_route_selection: "已选创意路线",
  creative_outline_draft: "创意大纲草案",
  creative_outline: "已锁定创意大纲",
  outline_script: "大纲脚本",
  content_master_draft: "主稿草案",
  master_review: "主稿审校",
  content_master: "已锁定主稿",
  spoken_script: "口播稿",
  recording_execution: "录制执行单",
  requirement_set: "素材需求集合",
  preproduction_material_plan: "前期素材执行计划",
  production_plan: "制作单元计划",
  asset_plan: "素材计划",
  subtitle: "字幕",
};

const FIELD_TITLES: Record<string, string> = {
  audienceMoment: "读者所处场景",
  sourceId: "来源编号",
  sourceLabel: "来源名称",
  topicId: "题目编号",
  publishedAt: "发布时间",
  fetchedAt: "抓取时间",
  selectedAt: "选择时间",
  confirmedAt: "确认时间",
  reviewedAt: "审校时间",
  readerDecision: "读者要做的决定",
  immediateBenefit: "立即收益",
  longTermBenefit: "长期收益",
  beliefToChange: "希望改变的认知",
  proofToShow: "需要展示的证据",
  evidenceBoundary: "证据边界",
  narratorPosition: "叙述者位置",
  promotionalTemperature: "宣传温度",
  primaryCallToAction: "主要行动号召",
  humanCenter: "人文中心",
  authorStance: "作者立场",
  warmThread: "贯穿线",
  emotionalArc: "情绪弧",
  evidencePosture: "证据姿态",
  coreMessage: "宣传核心",
  guidanceIntent: "用户引导意图",
  centralTension: "核心张力",
  openingScene: "开场场景",
  proofMethod: "证明方式",
  readerShift: "读者变化",
  whyThisRoute: "选择理由",
  creativePremise: "创意前提",
  storyEngine: "故事引擎",
  narrativeAnchor: "叙事锚点",
  openingMove: "开场动作",
  progression: "推进方式",
  proofPlan: "证据计划",
  endingMove: "收束动作",
  hookAndFirstFrame: "钩子与第一帧",
  sectionPurpose: "段落职责",
  sceneOrAction: "场景或动作",
  content: "内容",
  authorJudgment: "作者判断",
  visualAsset: "视觉素材",
  shotPurpose: "镜头目的",
  spokenContent: "口播内容",
  recordingDirection: "录制指示",
  visualAction: "画面动作",
  composition: "构图",
  materialType: "素材类型",
  purpose: "用途",
  evidenceRole: "证据角色",
  productionIntent: "制作意图",
  constraints: "限制条件",
  avoid: "避免事项",
  usageId: "用途编号",
  fragmentId: "片段编号",
  sourcePath: "资料路径",
  targetChineseCharacterRange: "中文字符目标范围",
  targetDurationSeconds: "目标时长",
  uniqueAcquisitionCount: "独立采集数量",
  plannedUsageCount: "计划使用次数",
  preferredRoute: "首选制作路线",
  requirementId: "需求编号",
  sourceAssetId: "来源素材",
  route: "制作路线",
  status: "状态",
  dependencies: "依赖",
  capabilityGaps: "能力缺口",
  passed: "是否通过",
  findings: "审校发现",
  warnings: "警告",
};

interface ArtifactEntry {
  ref: ArtifactRef;
  record: ArtifactRecord;
}

/**
 * Freezes all passed upstream material into one reader-first packet. The
 * structured artifact remains machine-traceable, while markdown is deliberately
 * translated into a decision document rather than exposing storage JSON.
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
  const entries = await Promise.all(refs.map(async (ref) => ({
    ref,
    record: await input.artifacts.read(ref.artifactId),
  })));
  const markdownSections = sections.map((section) => {
    const sectionEntries = section.artifacts.map((ref) => {
      const entry = entries.find((candidate) => candidate.ref.artifactId === ref.artifactId);
      return entry ? renderArtifact(entry.ref, entry.record) : [];
    });
    return [
      `## ${section.title}`,
      sectionEntries.length > 0
        ? sectionEntries.map((lines) => lines.join("\n")).join("\n\n")
        : "本节点没有新增制品。",
    ].join("\n\n");
  });

  const requestedAt = new Date().toISOString();
  const markdown = [
    "# 宣传工作流人工审核包",
    "",
    "> 这是 Agent 根据已冻结制品整理的人审摘要。先看结论和待决事项；底层 JSON 不在这里展开，需要机器追溯时按制品编号和内容哈希查对应制品。",
    "",
    renderReviewOverview(input.record, input.requestedRevision, input.reason, entries),
    "",
    ...markdownSections,
    "",
    renderEventTimeline(input.record.events),
    "",
    renderDecisionInstructions(input.requestedRevision),
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

function renderReviewOverview(
  record: WorkflowRecord,
  requestedRevision: number,
  reason: string,
  entries: readonly ArtifactEntry[],
): string {
  const lines = [
    "## 先看结论",
    `- 工作流：${record.id}`,
    `- 载体：${record.carrier === "article" ? "文章/推文" : "视频"}`,
    `- 本次审核版本：r${requestedRevision}`,
    `- 触发原因：${reason}`,
    `- 当前流程判断：${record.summary}`,
  ];

  const master = latestContentMaster(entries);
  if (master) {
    const masterValue = isRecord(master.record.content) ? master.record.content : {};
    const nestedMaster = isRecord(masterValue.master) ? masterValue.master : masterValue;
    const title = textValue(nestedMaster.title ?? nestedMaster.workingTitle);
    const budget = isRecord(masterValue.budget) ? masterValue.budget : undefined;
    if (title) lines.push(`- 当前主稿：${title}`);
    if (budget) lines.push(`- 内容预算：${budgetSummary(budget)}`);
    const body = textValue(nestedMaster.bodyMarkdown);
    if (body) lines.push(`- 主稿正文长度：${bodyLength(body)} 字符（按中文字符粗略计数）`);
  }

  const review = latestEntry(entries, "master_review");
  const reviewContent = review && isRecord(review.record.content) ? review.record.content : undefined;
  const reviewPassed = nestedBoolean(reviewContent, "review", "passed") ?? booleanValue(reviewContent?.passed);
  if (reviewPassed !== undefined) lines.push(`- 主稿审校：${reviewPassed ? "通过" : "未通过"}`);

  const requirements = latestEntry(entries, "requirement_set");
  const requirementList = arrayValue(isRecord(requirements?.record.content) ? requirements?.record.content.requirements : undefined);
  if (requirementList) lines.push(`- 素材需求：${requirementList.length} 项`);

  const production = latestEntry(entries, "production_plan");
  const productionContent = isRecord(production?.record.content) ? production?.record.content : undefined;
  const units = arrayValue(productionContent?.units);
  if (units) lines.push(`- 制作计划：${units.length} 个制作单元${hasNonEmptyArray(productionContent, "capabilityGaps") ? "，存在能力缺口" : ""}`);

  lines.push(
    "",
    "### 给审核人的一句话",
    "请判断：这组前序交付物是否已经足够支撑进入制作；重点看主张是否明确、证据是否真实可核对、素材是否真的能证明正文中的判断。",
  );
  return lines.join("\n");
}

function renderArtifact(ref: ArtifactRef, record: ArtifactRecord): string[] {
  const title = KIND_TITLES[ref.kind] ?? humanizeKey(ref.kind);
  const lines = [
    `### ${title} · r${ref.revision}`,
    traceLine(ref),
  ];

  switch (ref.kind) {
    case "fetched_topic_cards":
      return lines.concat(renderTopicCards(record.content));
    case "topic_match":
      return lines.concat(renderTopicMatch(record.content));
    case "selected_topic":
      return lines.concat(renderSelectedTopic(record.content));
    case "baseline_draft":
    case "baseline":
      return lines.concat(renderBaseline(record.content));
    case "creative_routes":
      return lines.concat(renderCreativeRoutes(record.content));
    case "creative_route_selection":
      return lines.concat(renderCreativeRouteSelection(record.content));
    case "creative_outline_draft":
    case "creative_outline":
      return lines.concat(renderOutline(record.content));
    case "content_master_draft":
    case "content_master":
      return lines.concat(renderContentMaster(record.content));
    case "master_review":
      return lines.concat(renderMasterReview(record.content));
    case "requirement_set":
      return lines.concat(renderRequirements(record.content));
    case "production_plan":
      return lines.concat(renderProductionPlan(record.content));
    case "workspace_progress_audit":
      return lines.concat(renderWorkspaceProgressAudit(record.content));
    case "competition_report":
      return lines.concat(renderCompetitionReport(record.content));
    default:
      return lines.concat(renderReadable(record.content));
  }
}

function renderCompetitionReport(value: unknown): string[] {
  const object = asRecord(value);
  if (!object) return renderReadable(value);
  const candidates = arrayValue(object.candidates) ?? [];
  const recommendedCandidateId = textValue(object.recommendedCandidateId);
  const lines = [
    `- 使用 ${textValue(object.selectionMode) ?? "Top-p"} 比较 ${candidates.length} 条候选路线，保留 ${arrayValue(object.retainedCandidateIds)?.length ?? 0} 条强候选。`,
  ];
  if (recommendedCandidateId) lines.push(`- Agent 主推荐：${recommendedCandidateId}。`);
  pushField(lines, "推荐理由", object.recommendationRationale);
  candidates.forEach((item, index) => {
    const candidate = asRecord(item);
    if (!candidate) return lines.push(`- 候选 ${index + 1}：${formatValue(item)}`);
    const id = textValue(candidate.id) ?? `候选 ${index + 1}`;
    const selected = id === recommendedCandidateId ? "（主推荐）" : "";
    lines.push(`#### ${id}${selected}`);
    pushField(lines, "路线", candidate.strategy);
    pushField(lines, "概述", candidate.summary);
    pushField(lines, "语境匹配评分", candidate.score);
    pushField(lines, "已通过硬约束", candidate.hardConstraintPassed === true ? "是" : "否");
  });
  return lines;
}

function renderTopicCards(value: unknown): string[] {
  const cards = arrayValue(value);
  if (!cards) return renderReadable(value);
  const lines: string[] = [`- 共整理 ${cards.length} 张来源材料卡。`];
  cards.forEach((item, index) => {
    const card = asRecord(item);
    if (!card) {
      lines.push(`- 材料卡 ${index + 1}：${formatValue(item)}`);
      return;
    }
    lines.push(`#### 材料卡 ${index + 1}：${textValue(card.title) ?? "未命名"}`);
    pushField(lines, "来源", card.sourceLabel ?? card.sourceId);
    pushField(lines, "链接", card.url);
    pushField(lines, "摘要", card.excerpt);
    pushField(lines, "发布时间", card.publishedAt);
  });
  return lines;
}

function renderTopicMatch(value: unknown): string[] {
  const object = asRecord(value);
  if (!object) return renderReadable(value);
  const candidates = arrayValue(object.candidates) ?? [];
  const lines = [
    `- 共比较 ${numberValue(object.fetchedTopicCount) ?? candidates.length} 个题目，保留 ${candidates.length} 个候选。`,
  ];
  candidates.forEach((item, index) => {
    const candidate = asRecord(item);
    if (!candidate) return lines.push(`- 候选 ${index + 1}：${formatValue(item)}`);
    lines.push(`#### 候选 ${index + 1}：${textValue(candidate.title) ?? "未命名"}`);
    pushField(lines, "匹配总分", candidate.score);
    pushField(lines, "产品契合度", candidate.productFit);
    pushField(lines, "话题动量", candidate.topicMomentum);
    pushField(lines, "来源", candidate.source);
    pushField(lines, "理由", candidate.rationale);
    pushField(lines, "链接", candidate.url);
  });
  pushField(lines, "警告", object.warnings);
  return lines;
}

function renderSelectedTopic(value: unknown): string[] {
  const object = asRecord(value);
  if (!object) return renderReadable(value);
  const topic = asRecord(object.topic);
  const lines = [`- 已选题目：${textValue(topic?.title) ?? "未命名"}`];
  pushField(lines, "来源", topic?.source);
  pushField(lines, "链接", topic?.url);
  pushField(lines, "摘要", topic?.excerpt);
  pushField(lines, "选定材料", object.selectedMaterials);
  return lines;
}

function renderBaseline(value: unknown): string[] {
  const object = asRecord(value);
  if (!object) return renderReadable(value);
  const lines: string[] = [];
  pushField(lines, "宣传核心", object.coreMessage);
  pushField(lines, "用户引导意图", object.guidanceIntent);
  const campaign = asRecord(object.campaignIntent);
  if (campaign) {
    lines.push("#### 传播判断");
    renderNamedFields(lines, campaign, [
      "audienceMoment", "immediateBenefit", "longTermBenefit", "beliefToChange", "proofToShow",
      "evidenceBoundary", "narratorPosition", "promotionalTemperature", "primaryCallToAction", "avoid",
    ]);
  }
  const editorial = asRecord(object.articleEditorialIntent);
  if (editorial) {
    lines.push("#### 文章编辑意图");
    renderNamedFields(lines, editorial, ["readerDecision", "humanCenter", "authorStance", "warmThread", "emotionalArc", "evidencePosture"]);
  }
  return lines.length > 0 ? lines : renderReadable(value);
}

function renderCreativeRoutes(value: unknown): string[] {
  const object = asRecord(value);
  const routes = arrayValue(object?.routes);
  if (!routes) return renderReadable(value);
  const lines: string[] = [`- 共提出 ${routes.length} 条互斥路线：`];
  routes.forEach((item, index) => {
    const route = asRecord(item);
    if (!route) return lines.push(`- 路线 ${index + 1}：${formatValue(item)}`);
    lines.push(`#### 路线 ${index + 1}：${textValue(route.name) ?? "未命名"}`);
    renderNamedFields(lines, route, ["centralTension", "openingScene", "proofMethod", "readerShift", "whyThisRoute"]);
  });
  return lines;
}

function renderCreativeRouteSelection(value: unknown): string[] {
  const object = asRecord(value);
  const route = asRecord(object?.route);
  if (!route) return renderReadable(value);
  const lines = [`- 已选路线：${textValue(route.name) ?? "未命名"}`];
  renderNamedFields(lines, route, ["centralTension", "openingScene", "proofMethod", "readerShift", "whyThisRoute"]);
  return lines;
}

function renderOutline(value: unknown): string[] {
  const object = asRecord(value);
  if (!object) return renderReadable(value);
  const lines: string[] = [];
  if (asRecord(object.budget)) lines.push(`- 内容预算：${budgetSummary(asRecord(object.budget) as Record<string, unknown>)}`);
  const spine = asRecord(object.creativeSpine);
  if (spine) {
    lines.push("#### 创意主轴");
    renderNamedFields(lines, spine, ["creativePremise", "storyEngine", "narrativeAnchor", "openingMove", "progression", "proofPlan", "endingMove"]);
  }
  const outline = asRecord(object.outline);
  if (!outline) return lines.length > 0 ? lines : renderReadable(value);
  pushField(lines, "载体", outline.carrier);
  pushField(lines, "开场方向", outline.openingDirection ?? outline.hookAndFirstFrame);
  const sections = arrayValue(outline.sections);
  const segments = arrayValue(outline.segments);
  if (sections) {
    lines.push("#### 文章段落");
    sections.forEach((item, index) => {
      const section = asRecord(item);
      lines.push(`- ${index + 1}. ${textValue(section?.sectionPurpose) ?? textValue(section?.id) ?? "未命名段落"}`);
      if (section) {
        pushNestedField(lines, "场景/动作", section.sceneOrAction);
        pushNestedField(lines, "内容", section.content);
        pushNestedField(lines, "读者变化", section.readerShift);
        pushNestedField(lines, "证据", section.evidence);
        pushNestedField(lines, "视觉素材", section.visualAsset);
      }
    });
  }
  if (segments) {
    lines.push("#### 视频段落");
    segments.forEach((item, index) => {
      const segment = asRecord(item);
      lines.push(`- ${index + 1}. ${textValue(segment?.segmentPurpose) ?? textValue(segment?.id) ?? "未命名段落"}（${textValue(segment?.durationSeconds) ?? "?"} 秒）`);
      if (segment) {
        pushNestedField(lines, "口播功能", segment.spokenFunction);
        pushNestedField(lines, "画面功能", segment.visualFunction);
        pushNestedField(lines, "证据", segment.evidence);
      }
    });
  }
  pushField(lines, "标题方向", outline.titleDirections);
  pushField(lines, "未支持主张", outline.unsupportedClaims);
  pushField(lines, "结尾", outline.ending);
  pushField(lines, "主要行动号召", outline.primaryCallToAction);
  return lines.length > 0 ? lines : renderReadable(value);
}

function renderContentMaster(value: unknown): string[] {
  const object = asRecord(value);
  if (!object) return renderReadable(value);
  const master = asRecord(object.master) ?? object;
  const lines: string[] = [];
  pushField(lines, "标题", master.title ?? master.workingTitle);
  pushField(lines, "备选标题", master.alternativeTitles);
  pushField(lines, "载体", master.carrier);
  pushField(lines, "目标时长", master.targetDurationSeconds ? `${master.targetDurationSeconds} 秒` : undefined);
  if (asRecord(object.budget)) lines.push(`- 内容预算：${budgetSummary(asRecord(object.budget) as Record<string, unknown>)}`);
  if (typeof master.bodyMarkdown === "string") {
    lines.push("#### 正文主稿");
    lines.push(renderBodyMarkdown(master.bodyMarkdown));
  }
  const shots = arrayValue(master.shots);
  if (shots) {
    lines.push("#### 分镜主稿");
    shots.forEach((item, index) => {
      const shot = asRecord(item);
      const range = asRecord(shot?.timeRange);
      const duration = range ? `${formatMilliseconds(range.startMs)}–${formatMilliseconds(range.endMs)}` : "时间未标注";
      lines.push(`- ${index + 1}. ${duration}：${textValue(shot?.shotPurpose) ?? textValue(shot?.id) ?? "未命名镜头"}`);
      if (shot) {
        pushNestedField(lines, "口播", shot.spokenContent);
        pushNestedField(lines, "画面动作", shot.visualAction);
        pushNestedField(lines, "录制指示", shot.recordingDirection);
        pushNestedField(lines, "证据", shot.evidenceRefs);
      }
    });
  }
  const placements = arrayValue(master.assetPlacements);
  if (placements) {
    lines.push("#### 视觉锚点");
    placements.forEach((item, index) => {
      const placement = asRecord(item);
      lines.push(`- ${index + 1}. ${textValue(placement?.id) ?? "锚点"}：${textValue(placement?.editorialPurpose) ?? "未说明证明目的"}`);
    });
  }
  pushField(lines, "主要行动号召", master.primaryCallToAction);
  return lines.length > 0 ? lines : renderReadable(value);
}

function renderMasterReview(value: unknown): string[] {
  const object = asRecord(value);
  if (!object) return renderReadable(value);
  const review = asRecord(object.review) ?? object;
  const lines: string[] = [];
  pushField(lines, "总体结果", booleanValue(review.passed) === true ? "通过" : booleanValue(review.passed) === false ? "未通过" : undefined);
  pushField(lines, "证据阻塞", review.evidenceBlockers);
  const writingStyle = asRecord(review.writingStyle);
  if (writingStyle) {
    lines.push("#### 写作审校");
    pushField(lines, "结果", booleanValue(writingStyle.passed) === true ? "通过" : booleanValue(writingStyle.passed) === false ? "未通过" : undefined);
    pushField(lines, "发现", writingStyle.findings);
  }
  const editorial = asRecord(review.articleEditorial);
  if (editorial) {
    lines.push("#### 文章编辑审校");
    pushField(lines, "结果", booleanValue(editorial.passed) === true ? "通过" : booleanValue(editorial.passed) === false ? "未通过" : undefined);
    pushField(lines, "发现", editorial.findings);
  }
  const storyboard = asRecord(review.storyboardDirection);
  if (storyboard) {
    lines.push("#### 分镜审校");
    pushField(lines, "结果", booleanValue(storyboard.passed) === true ? "通过" : booleanValue(storyboard.passed) === false ? "未通过" : undefined);
    pushField(lines, "发现", storyboard.findings);
  }
  pushField(lines, "素材效率发现", review.assetEfficiencyFindings);
  pushField(lines, "警告", object.warnings);
  return lines.length > 0 ? lines : renderReadable(value);
}

function renderRequirements(value: unknown): string[] {
  const object = asRecord(value);
  const requirements = arrayValue(object?.requirements);
  if (!requirements) return renderReadable(value);
  const lines = [`- 共 ${requirements.length} 项素材需求。`];
  requirements.forEach((item, index) => {
    const requirement = asRecord(item);
    if (!requirement) return lines.push(`- 需求 ${index + 1}：${formatValue(item)}`);
    lines.push(`#### 需求 ${index + 1}：${textValue(requirement.requirementId) ?? "未编号"}`);
    pushField(lines, "来源素材", requirement.sourceAssetId);
    pushField(lines, "素材类型", requirement.materialType);
    const usages = arrayValue(requirement.usages);
    if (usages && usages.length > 0) {
      lines.push("- 用途：");
      usages.forEach((item) => {
        const usage = asRecord(item);
        if (!usage) {
          lines.push(`  - ${formatValue(item)}`);
          return;
        }
        lines.push(`  - ${textValue(usage.usageId) ?? "未编号"}：${textValue(usage.purpose) ?? "未说明"}`);
        pushNestedField(lines, "片段", usage.fragmentId);
      });
    }
    pushField(lines, "限制条件", requirement.constraints);
    pushField(lines, "复用次数", requirement.reuseCount);
  });
  return lines;
}

function renderProductionPlan(value: unknown): string[] {
  const object = asRecord(value);
  const units = arrayValue(object?.units);
  if (!object || !units) return renderReadable(value);
  const lines = [`- 共 ${units.length} 个制作单元。`];
  units.forEach((item, index) => {
    const unit = asRecord(item);
    if (!unit) return lines.push(`- 制作单元 ${index + 1}：${formatValue(item)}`);
    lines.push(`- ${index + 1}. ${textValue(unit.id) ?? "未编号"}：${textValue(unit.route) ?? "未指定路线"}，当前状态为${textValue(unit.status) ?? "未标注"}`);
    pushNestedField(lines, "需求", unit.requirementIds);
    pushNestedField(lines, "依赖", unit.dependencies);
  });
  pushField(lines, "复用需求", object.reusedRequirementIds);
  pushField(lines, "能力缺口", object.capabilityGaps);
  return lines;
}

function renderWorkspaceProgressAudit(value: unknown): string[] {
  const object = asRecord(value);
  if (!object) return renderReadable(value);
  const coverage = arrayValue(object.nodeCoverage) ?? [];
  const missing = arrayValue(object.missingItems) ?? [];
  const lines = [
    `- 目标接续节点：${textValue(object.requestedStartNode) ?? "未标注"}`,
    `- Agent 建议：${textValue(object.recommendation) ?? "未标注"}；建议起点为节点 ${textValue(object.recommendedStartNode) ?? "未标注"}`,
    `- 节点覆盖：已记录 ${coverage.length} 项评估；缺失项 ${missing.length} 项。`,
  ];
  missing.forEach((item, index) => {
    const entry = asRecord(item);
    if (!entry) return lines.push(`- 缺失项 ${index + 1}：${formatValue(item)}`);
    lines.push(`- ${textValue(entry.severity) === "major_decision_gap" ? "重大决策断层" : "可省略项"}：${textValue(entry.label) ?? "未命名"}（节点 ${textValue(entry.node) ?? "?"}）`);
    pushNestedField(lines, "原因", entry.reason);
  });
  pushField(lines, "资料来源", object.sourcePaths);
  pushField(lines, "Grill 问题", object.grillQuestions);
  return lines;
}

function renderEventTimeline(events: readonly WorkflowEvent[]): string {
  const lines = ["## 事件与决策时间线"];
  if (events.length === 0) return `${lines[0]}\n\n暂无事件记录。`;
  events.forEach((event) => {
    lines.push(`- r${event.revision} · ${formatDate(event.at)} · ${eventKindTitle(event.kind)}：${event.summary}`);
  });
  return lines.join("\n");
}

function renderDecisionInstructions(requestedRevision: number): string {
  return [
    "## 你现在要做的决定",
    "",
    `这是 r${requestedRevision} 的审核包。请只选择一个决定，并在提交时使用本包对应的制品编号和 acceptedRevision。`,
    "",
    "- 批准：回复 `approve`，说明为什么证据和制作单元已经足够进入制作。",
    "- 退回：回复 `revise`，并指定退回节点 2、3、4 或 5，同时写清需要修改的判断。",
    "- 拒绝：回复 `reject`，说明当前方案为什么不再继续。",
    "",
    "批准不会自动证明素材已经拍摄；它只表示当前前序方案可以进入制作阶段。",
  ].join("\n");
}

function renderBodyMarkdown(body: string): string {
  return body
    .replace(/<!--\s*visual-anchor:\s*([^>]+?)\s*-->/g, "> 画面锚点：$1")
    .trim();
}

function renderNamedFields(lines: string[], object: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of keys) pushField(lines, FIELD_TITLES[key] ?? humanizeKey(key), object[key]);
}

function pushField(lines: string[], label: string, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  lines.push(`- ${label}：${formatValue(value)}`);
}

function pushNestedField(lines: string[], label: string, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  if (Array.isArray(value) && value.length > 0) {
    lines.push(`  - ${label}：`);
    value.forEach((item) => lines.push(`    - ${formatValue(item)}`));
    return;
  }
  lines.push(`  - ${label}：${formatValue(value)}`);
}

function renderReadable(value: unknown): string[] {
  if (value === undefined || value === null) return ["- 暂无可展示内容。"];
  if (typeof value !== "object") return [`- ${formatValue(value)}`];
  const lines: string[] = [];
  renderReadableObject(value, lines, 0);
  return lines.length > 0 ? lines : ["- 暂无可展示内容。"];
}

function renderReadableObject(value: unknown, lines: string[], depth: number, parentLabel?: string): void {
  const prefix = "  ".repeat(depth);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (isRecord(item)) {
        lines.push(`${prefix}- ${parentLabel ? `${parentLabel} ${index + 1}` : `项目 ${index + 1}`}：`);
        renderReadableObject(item, lines, depth + 1);
      } else {
        lines.push(`${prefix}- ${formatValue(item)}`);
      }
    });
    return;
  }
  if (!isRecord(value)) {
    lines.push(`${prefix}- ${formatValue(value)}`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const label = FIELD_TITLES[key] ?? humanizeKey(key);
    if (isRecord(child) || Array.isArray(child)) {
      lines.push(`${prefix}- ${label}：`);
      renderReadableObject(child, lines, depth + 1, label);
    } else {
      lines.push(`${prefix}- ${label}：${formatValue(child)}`);
    }
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "未填写";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "string") return value.includes("\n") ? `\n${value.trim()}` : value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "无";
    if (value.every((item) => typeof item !== "object" || item === null)) return value.map(formatValue).join("；");
    return value.map((item) => formatValue(item)).join("；");
  }
  if (isRecord(value)) {
    return Object.entries(value).map(([key, child]) => `${FIELD_TITLES[key] ?? humanizeKey(key)}=${formatValue(child)}`).join("；");
  }
  return String(value);
}

function traceLine(ref: ArtifactRef): string {
  return `> 制品追踪：${ref.artifactId} · r${ref.revision} · hash ${ref.contentHash} · 生成于 ${formatDate(ref.createdAt)}`;
}

function latestContentMaster(entries: readonly ArtifactEntry[]): ArtifactEntry | undefined {
  return latestEntry(entries, "content_master") ?? latestEntry(entries, "content_master_draft");
}

function latestEntry(entries: readonly ArtifactEntry[], kind: ArtifactKind): ArtifactEntry | undefined {
  return entries
    .filter((entry) => entry.ref.kind === kind)
    .sort((left, right) => {
      const revisionDelta = right.ref.revision - left.ref.revision;
      if (revisionDelta !== 0) return revisionDelta;
      return right.ref.createdAt.localeCompare(left.ref.createdAt);
    })[0];
}

function nestedBoolean(value: unknown, parentKey: string, key: string): boolean | undefined {
  const parent = isRecord(value) ? asRecord(value[parentKey]) : undefined;
  return booleanValue(parent?.[key]);
}

function hasNonEmptyArray(value: unknown, key: string): boolean {
  const items = arrayValue(isRecord(value) ? value[key] : undefined);
  return items !== undefined && items.length > 0;
}

function budgetSummary(value: Record<string, unknown>): string {
  if (Array.isArray(value.targetChineseCharacterRange)) {
    return `${value.tier ?? "未分级"}，目标 ${value.targetChineseCharacterRange.join("–")} 字`;
  }
  if (value.targetDurationSeconds !== undefined) {
    return `${value.tier ?? "未分级"}，目标 ${value.targetDurationSeconds} 秒`;
  }
  return formatValue(value);
}

function bodyLength(body: string): number {
  return [...body.replace(/<!--[^>]+-->/g, "")].length;
}

function formatMilliseconds(value: unknown): string {
  const milliseconds = numberValue(value);
  if (milliseconds === undefined) return "?";
  return `${Math.floor(milliseconds / 60000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}`;
}

function formatDate(value: string): string {
  return value.replace("T", " ").replace(/\.\d{3}Z$/, "").replace(/Z$/, " UTC");
}

function eventKindTitle(kind: WorkflowEvent["kind"]): string {
  const titles: Record<string, string> = {
    workflow_created: "工作流创建",
    workspace_confirmed: "工作区已确认",
    fetched_topics_submitted: "来源材料卡提交",
    automatic_step: "自动节点完成",
    topic_selected: "选题锁定",
    baseline_proposed: "宣传意图提交",
    baseline_grill_answered: "宣传意图 Grill 已回答",
    baseline_locked: "宣传意图锁定",
    creative_routes_proposed: "创意路线提交",
    creative_route_selected: "创意路线选择",
    outline_draft_submitted: "大纲提交",
    outline_grill_answered: "大纲 Grill 已回答",
    outline_locked: "大纲锁定",
    master_draft_submitted: "主稿提交",
    master_grill_answered: "主稿 Grill 已回答",
    master_locked: "主稿锁定",
    human_review_requested: "申请人工审核",
    human_review_approved: "人工审核批准",
    human_revision_requested: "人工审核退回",
    human_review_rejected: "人工审核拒绝",
    competition_report_submitted: "竞争报告提交",
    production_units_updated: "制作单元更新",
    production_locked: "制作锁定",
    release_package_submitted: "发布包提交",
    release_locked: "发布包锁定",
    note_saved: "备注保存",
  };
  return titles[kind] ?? humanizeKey(kind);
}

function humanizeKey(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
