import type { GuidanceResource } from "./guidance-catalog.js";

export const ARTICLE_PLANNING_ISSUE_CODES = [
  "article_form",
  "long_range_movement",
  "section_design",
  "rhythm_allocation",
  "voice_consistency",
  "reader_interest",
  "product_entry",
] as const;

export type ArticlePlanningIssueCode = (typeof ARTICLE_PLANNING_ISSUE_CODES)[number];

export const ARTICLE_PLANNING_ROUTER_GUIDANCE = `# 文章策划诊断与按需细化

在写出主稿之前，先把文章的逻辑和传达方式一起设计。先检查七项：文章类型是否适合材料；全文推进是否成立；每个部分是否有唯一任务；哪些部分该展开、哪些该压缩；声音和语气是否连续；读者每一段为什么愿意继续；产品是否由前文建立的需求自然引入。

首次只输出 clear、issue 或 uncertain，并引用契约或大纲中的原文。issue 和 uncertain 必须映射为 planningIssueCodes。随后再调用 promo_guidance，只提交实际发现的问题码；系统只返回相关细化卡。修订后回到同一份文章设计蓝图，说明哪个字段、哪个部分被改变，以及它怎样改善主稿的展开依据。

文章契约负责全篇：articleForm、narrativeStrategy、voiceAndTone、readerRelationship。每个 section.design 负责一段：contentSequence、emphasis、expressionMethod、voiceAndRhythm、attentionHook、handoff。它们不是装饰字段；主稿和审校都以它们为准。`;

const fixed: GuidanceResource = {
  id: "article-planning-checks",
  title: "文章设计固定检查",
  content: `逐项检查：
1. article_form：文章类型是否匹配目标读者、材料和产品引入方式。
2. long_range_movement：不看小标题能否复述从开篇到结尾的理解变化。
3. section_design：每段是否有内容顺序、重点、手法、节奏、抓手和交接，且与其他段不重叠。
4. rhythm_allocation：解释、观察、例子和判断是否有合理的展开与压缩。
5. voice_consistency：作者距离、技术密度、语气和叙述权限是否持续一致。
6. reader_interest：每段是否带来新信息、新理解或可感知的具体性。
7. product_entry：产品是否回答了前文已经建立的真实需求，而非突然出现。`,
};

const repairs: Record<ArticlePlanningIssueCode, GuidanceResource> = {
  article_form: { id: "article-form-repair", title: "文章类型修复", content: "从材料性质和读者状态选择一个主导组织方式。写清它的开场、证明和收束各承担什么，不把多个文章类型机械拼接。" },
  long_range_movement: { id: "long-range-movement-repair", title: "全文推进修复", content: "先写出读者理解变化的因果链，再给每个部分分配唯一贡献。删掉不能改变理解的重复段。" },
  section_design: { id: "section-design-repair", title: "分部设计修复", content: "逐段补齐内容顺序、展开程度、表达手法、节奏、阅读抓手和交接。后一段必须回应前段留下的具体条件。" },
  rhythm_allocation: { id: "rhythm-allocation-repair", title: "篇幅与节奏修复", content: "把复杂关系留给展开段；背景、重复判断和已被证明的内容压缩。用事实、短判断或自然换段给读者消化时间。" },
  voice_consistency: { id: "voice-consistency-repair", title: "声音一致性修复", content: "回到作者立场和读者关系，统一技术密度与语气。删除忽然煽情、故作锋利或无依据的亲密感。" },
  reader_interest: { id: "reader-interest-repair", title: "阅读吸引力修复", content: "每段至少提供一个新条件、具体动作、有效判断或被解释清楚的机制。不要用悬念话术替代内容。" },
  product_entry: { id: "product-entry-repair", title: "产品引入修复", content: "先补足使用过程中的需求、限制或未解决条件，再让产品能力作为对该条件的回应出现。若材料不支持，就收窄产品表述。" },
};

export function articlePlanningResources(issueCodes: readonly ArticlePlanningIssueCode[] = []): GuidanceResource[] {
  const selected = new Set(issueCodes);
  return [fixed, ...ARTICLE_PLANNING_ISSUE_CODES.filter((code) => selected.has(code)).map((code) => repairs[code])];
}
