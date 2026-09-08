import type { GuidanceResource } from "./guidance-catalog.js";

export const EDITORIAL_ISSUE_CODES = [
  "long_range_logic",
  "paragraph_transition",
  "fabricated_feeling",
  "adversarial_wording",
  "density_rhythm",
  "reader_gap",
] as const;

export type EditorialIssueCode = (typeof EDITORIAL_ISSUE_CODES)[number];

export const EDITORIAL_PROBLEM_ROUTER_GUIDANCE = `# 编辑问题发现与按需修复

先抽取，再判断。首次加载时只执行固定阅读检查，不预先加载风格修复方法，也不读取上一版的修改自述。

依次完成五项检查：逐段写出新增信息；说明相邻段落的实质关系；列出替读者声明的感受、经历和习惯及其来源；列出反驳句及其真实回应对象；按目标读者指出理解下一段所缺的前提。

每项输出 clear、issue 或 uncertain，并引用当前稿件中的原文。issue 和 uncertain 都要映射为 issueCodes。首次存稿发现问题时，先以 passed=false 保存判断，形成可引用的旧稿版本。随后再次调用 promo_guidance，并只提交实际发现的 issueCodes；系统只返回对应修复卡。

修改后逐项记录 guidanceResourceId、修改位置、旧稿证据和新稿证据，再重做五项检查。editorialDiagnostic 使用 judgment → repairs → recheck 结构。只有所有触发项均有修复记录、复审没有 unresolvedIssueCodes，才可 passed=true。审计中的 verification 必须引用修改后文本并解释完成条件，不能使用“已优化、已加强、已复核”代替证据。`;

const fixed: GuidanceResource = {
  id: "fixed-reading-checks",
  title: "固定阅读检查",
  content: `不问“文章好不好”。输出五项可观察结果：
1. paragraph_contribution：每段新增了什么；重复、无法复述或只有姿态时触发 long_range_logic。
2. adjacency_basis：后一段为什么必须在这里；只能回答“进一步介绍”时触发 paragraph_transition。
3. narrative_claims：文中替读者声称了哪些感受、经历或习惯，依据在哪里；无依据时触发 fabricated_feeling。
4. objection_targets：每个反驳、转折或“真正重要”回应哪条已经出现的观点；找不到时触发 adversarial_wording。
5. reader_prerequisites：目标读者理解下一段还缺什么；缺术语、前提或因果时触发 reader_gap。
连续解释造成阅读压力、句段长度与思考节奏不匹配时触发 density_rhythm。不确定即触发，不用先证明问题成立。`,
};

const repairs: Record<EditorialIssueCode, GuidanceResource> = {
  long_range_logic: { id: "long-range-logic-repair", title: "全文逻辑修复", content: "先写一条全文因果链，再给每节分配唯一职责。合并重复结论；章节不能仅靠主题相近排列。完成条件：不看标题也能说明每节如何改变读者理解。" },
  paragraph_transition: { id: "paragraph-transition-repair", title: "段间关系修复", content: "指出前段留下的具体问题，以及后段提供的答案、条件、证据或后果。缺少中间前提时补事实；只有连接词时重排或删除。" },
  fabricated_feeling: { id: "narrative-permission-repair", title: "叙述权限修复", content: "删除无来源的读者情绪、群体习惯和使用经历。用已观察的动作、界面状态或作者有依据的判断替代；材料不足时保持中性。" },
  adversarial_wording: { id: "sentence-naturalness-repair", title: "无端较真与措辞修复", content: "删除没有真实回应对象的反驳、让步和排他对比。直接说事实和因果；一句话若主要用于显得锋利，就改成普通陈述。" },
  density_rhythm: { id: "paragraph-rhythm-repair", title: "段落松紧修复", content: "密集解释只持续到关键关系成立。随后用必要例子、短判断或自然换段给读者消化时间；不靠碎句、问句和空白制造呼吸。" },
  reader_gap: { id: "reader-gap-repair", title: "读者认知补足", content: "从目标读者已知内容出发，只补理解下一步所需的术语和前提。首次出现的名称先说明它在当前问题中做什么，再继续推导。" },
};

export function editorialProblemResources(issueCodes: readonly EditorialIssueCode[] = []): GuidanceResource[] {
  const selected = new Set(issueCodes);
  return [fixed, ...EDITORIAL_ISSUE_CODES.filter((code) => selected.has(code)).map((code) => repairs[code])];
}
