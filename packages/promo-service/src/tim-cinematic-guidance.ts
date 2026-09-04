import type { GuidanceResource } from "./guidance-catalog.js";

const SOURCE_BASIS: GuidanceResource = {
  id: "source-basis",
  title: "方法来源与使用边界",
  content: `本指导提炼公开科技影像中可观察的方法：用一个真实问题组织行动、证据、转折和余味。它不要求模仿任何创作者的人格、口头禅、固定片头、镜头、配乐或标题。\n\n只使用已锁定的材料、可复现实测和已标注为计划的拍摄安排；未知、失败和限制都必须保留。`,
};

export const TIM_CINEMATIC_VIDEO_INTENT_GUIDANCE = {
  content: `# 技术影像：视频意图\n\n仅在 Promo Workflow 的视频 N2 使用。先读取已锁定选题、证据边界和 campaign intent；把它压成一个可拍、可验证的问题，而不是一句产品赞美。\n\n交付时明确：\n- 观众正处于什么具体场景，为什么此刻值得看；\n- 影片要追问的一个真实问题；\n- 能在画面中兑现的视觉承诺；\n- 需要展示的真实行动、测试或失败，以及不可宣称的内容；\n- 结尾留给观众的决定或感受。\n\n只在问题会改变主线、证据或素材负担时提出 Grill。不要为追求戏剧性虚构数据、反应、实验、产品能力或结果。`,
  resources: [SOURCE_BASIS, {
    id: "intent-card",
    title: "问题、承诺与事实权限卡",
    content: `用「真实问题 → 视觉承诺 → 可执行动作 → 可见结果 → 人的余味」检查 campaign intent。视觉承诺应可由真实屏幕、实拍对象、采访、可复现演示或明确标记的示意画面兑现。把「可证明」「待验证」「不能声称」分别写清。`,
  }],
} as const;

export const TIM_CINEMATIC_VIDEO_ARCHITECTURE_GUIDANCE = {
  content: `# 技术影像：叙事架构\n\n仅在 Promo Workflow 的视频 N3 使用。先保留锁定的主张、时长和事实边界，再选一个主故事引擎来组织创意路线与视频大纲。\n\n可选引擎包括：单任务证据链、误解到看清、限制条件下的取舍、一次真实测试的发现、或从人的工作场景进入技术原理。每个 beat 只承担一个主要任务：提出问题、建立条件、行动/观察、展示证据、解释转折、收束到人的决定。\n\n分配注意力而非套固定节奏：需要时可让沉默、环境声、实拍操作或屏幕结果承担信息。不要按任何创作者的固定镜头频率、音色、片头或文案习惯复刻。`,
  resources: [SOURCE_BASIS, {
    id: "story-engines",
    title: "故事引擎与注意力分配",
    content: `先确定影片靠什么推动：问题的答案、行动的结果、条件的变化或人的选择。大纲应看得出悬念在哪里产生、证据何时出现、解释为什么不抢走体验、以及结尾为何不是重复卖点。镜头不是装饰，必须服务当前 beat 的叙事任务。`,
  }, {
    id: "beat-to-proof",
    title: "节拍到证据映射",
    content: `为每个 beat 标明预期画面证据、口播的必要性、声音职责与素材来源；没有证据的强结论要降级为问题、观察或待验证假设。`,
  }],
} as const;

export const TIM_CINEMATIC_VIDEO_PROOF_PLAN_GUIDANCE = {
  content: `# 技术影像：证据与前期计划\n\n仅在 Promo Workflow 的视频 N4 使用。把锁定大纲扩成可交给后续 CutWorkbench 生产的完整主稿与素材计划；本 Skill 不进入剪辑、导出或状态迁移。\n\n每个关键判断必须形成可追溯链：\n\n\`主张 → 条件/测试 → 镜头或屏幕行为 → 可见结果 → 限制/解释\`\n\n让每个镜头拥有一个主职责，检查时序连续、口播与画面互补、失败或不确定性没有被静默删除、素材可复用且采集负担合理。主稿锁定后，工作流会把分镜、台词、录制执行与前期素材计划交给生产适配层；不要用未拍摄的炫技镜头、伪造 UI 或虚构实测填空。`,
  resources: [SOURCE_BASIS, {
    id: "visual-production-grammar",
    title: "音画与覆盖语法",
    content: `把声音、画面、字幕和动作分工：口播承担必要解释或人的立场，画面兑现过程与结果，声音建立空间和转折，字幕只补充读者需要核对的信息。为关键动作准备可剪接的起因、过程、结果与反应覆盖。`,
  }, {
    id: "truth-and-similarity-gate",
    title: "真实与相似度闸门",
    content: `提交前逐项检查：事实是否有来源；测试条件是否可追溯；失败是否被保留；示意是否被标记；是否误把某位创作者的身份、口头禅、固定形式或未公开素材当作可复用方法。发现问题时回流到提出该主张的上游 beat。`,
  }],
} as const;
