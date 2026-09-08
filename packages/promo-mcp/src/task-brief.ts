import { VIDEO_PRODUCTION_PHASES } from '@promo-workflow/service';

/** User-facing guidance is deliberately separate from the agent's tool schema. */
export function readableTaskBrief(node: number, carrier: string, production: Record<string, unknown> | null) {
  const video = carrier === 'video';
  const guides: Record<number, [string, string, string]> = {
    1: ['整理选题和可以核实的材料。', '候选选题及对应依据。', '选题是否值得讲，材料是否可靠。'],
    2: ['明确给谁看、重点讲什么，以及希望观众或读者接下来做什么。', '一份明确的内容方向和事实边界。', '是不是你真正想表达的，有没有说过头。'],
    3: ['比较表达方式，安排内容的先后顺序。', '选定的创意路线和完整大纲。', '开头是否吸引人，内容是否连贯，重点有没有依据。'],
    4: [video ? '把大纲写成可录制的口播和对应画面安排。' : '按已确认的大纲写出完整文章，并根据批注修改。', video ? '口播稿、分镜稿和需要真实画面证明的内容。' : '可从头到尾阅读的主稿及修改说明。', '事实、名称和数字是否正确，表达是否自然，有没有遗漏或不能公开的内容。'],
    5: ['对照主稿整理素材需求，写清准备什么、怎么拍或录、怎样才算可用。', '素材清单、录制步骤和补拍补录说明。', '照着说明能否完成录制，关键观点是否有画面支撑，隐私是否已标出。'],
    6: [video ? '按已确认的制作计划逐步剪辑，每完成一层先审看再继续。' : '把已确认的主稿和素材排成完整预览，检查阅读效果。', video ? '当前阶段的审片视频、可修改工程和问题清单。' : '完整文章预览及尚未解决的问题清单。', video ? '故事是否讲通，画面和声音是否对应，批注是否真正解决。' : '正文是否完整，图文是否对应，排版是否清楚，批注是否解决。'],
    7: ['基于已经确认的内容准备发布信息，不新增未经核实的说法。', '标题、摘要、封面方向和发布说明。', '包装是否忠于正文，名称和行动提示是否正确。'],
  };
  let [doing, output, check] = guides[node] ?? guides[1]!;
  let status = '正在准备本步交付；请以正式提交的内容为准。';
  const phase = node === 6 && video && production
    ? VIDEO_PRODUCTION_PHASES.find(item => item.id === production.phase) : undefined;
  if (phase) {
    doing = phase.instruction;
    output = phase.output;
    check = phase.checks.join('；') + '。';
    const labels: Record<string, string> = { working: '制作中', waiting_material: '等待补充素材', awaiting_review: '等待你审看确认', paused_planning: '已暂停，等待策划确认', complete: '各阶段已确认，等待最终交付检查' };
    status = phase.label + ' · 第' + production!.round + '轮 · ' + (labels[String(production!.status)] ?? '等待处理');
  }
  return { status, doing, output, check };
}
