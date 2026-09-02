import type { LockedCreativeOutline, VideoOutline, VideoTimelineMaster } from "@promo-workflow/contracts";

import type { CompiledRequirementSet } from "./requirements-compiler.js";

/**
 * These are deliberately derived, inspection-ready handoffs. They do not
 * assign people or select production software; Node 6 owns both decisions.
 */
export function createOutlineScript(outline: LockedCreativeOutline): Record<string, unknown> {
  if (outline.outline.carrier !== "video") throw new Error("Outline script requires a locked video outline.");
  const video = outline.outline;
  return {
    schemaVersion: 1,
    kind: "video_outline_script",
    hookAndFirstFrame: video.hookAndFirstFrame,
    totalDurationSeconds: video.segments.reduce((total, segment) => total + segment.durationSeconds, 0),
    beats: video.segments.map((segment, index) => outlineBeat(segment, index)),
    proofBoundary: video.unsupportedClaims,
    ending: video.ending,
    primaryCallToAction: video.primaryCallToAction,
    acceptance: [
      "每段都有独立叙事任务、可见承诺和证据目标。",
      "开场先给结果或具体断点；未被证据覆盖的主张保留在 proofBoundary。",
      "本稿只定义扩写方向，不冒充逐字口播或逐镜头分镜。",
    ],
  };
}

export function createSpokenScript(master: VideoTimelineMaster): Record<string, unknown> {
  const lines = master.shots
    .filter((shot) => shot.spokenContent)
    .map((shot) => ({
      id: `LINE-${shot.id}`,
      timeRange: shot.timeRange,
      delivery: shot.spokenDelivery,
      text: shot.spokenContent,
      visualCoverage: shot.visualAction,
      evidenceRefs: shot.evidenceRefs,
      recordingDirection: shot.recordingDirection,
    }));
  return {
    schemaVersion: 1,
    kind: "spoken_script",
    targetDurationSeconds: master.targetDurationSeconds,
    lines,
    fixedOnScreenText: master.shots
      .filter((shot) => shot.onScreenText)
      .map((shot) => ({ shotId: shot.id, text: shot.onScreenText })),
    acceptance: [
      "每句都有成片时间、录制方式与对应画面。",
      "每句只陈述对应画面或证据可以证明的内容。",
      "CTA 必须从已展示的价值出发；未录到的事实不得写进台词。",
    ],
  };
}

export function createRecordingExecution(master: VideoTimelineMaster): Record<string, unknown> {
  const tasks = master.shots
    .filter((shot) => shot.spokenContent && shot.spokenDelivery)
    .map((shot) => ({
      id: `${shot.spokenDelivery}-${shot.id}`,
      mode: shot.spokenDelivery,
      sourceLineId: `LINE-${shot.id}`,
      timeRange: shot.timeRange,
      script: shot.spokenContent,
      setup: shot.spokenDelivery === "CAM" || shot.spokenDelivery === "MIXED"
        ? { composition: shot.composition, cameraBehavior: shot.cameraBehavior, visualCoverage: shot.visualAction }
        : { visualCoverage: shot.visualAction },
      direction: shot.recordingDirection,
      fileStem: `${shot.spokenDelivery}_${shot.id}`,
    }));
  return {
    schemaVersion: 1,
    kind: "recording_execution",
    overview: {
      camTaskCount: tasks.filter((task) => task.mode === "CAM" || task.mode === "MIXED").length,
      voTaskCount: tasks.filter((task) => task.mode === "VO" || task.mode === "MIXED").length,
    },
    defaultRules: [
      "同一组真人出镜如无叙事理由，保持固定正面中近景、构图留白、光线和收音一致。",
      "每个语义单元前后保留 1–2 秒静默；出错时重录整句。",
      "CAM 与 VO 分开命名、分别检查；任务对应的是成片时间线，不是人员分工。",
    ],
    tasks,
    acceptance: [
      "每一条已锁定台词都映射到 CAM、VO 或 MIXED 任务。",
      "每项任务有文件名、成片位置、录制方向和画面覆盖关系。",
    ],
  };
}

export function createPreproductionMaterialPlan(master: VideoTimelineMaster, requirements: CompiledRequirementSet): Record<string, unknown> {
  const sources = new Map(master.assetPlan.sourceAssets.map((source) => [source.id, source]));
  return {
    schemaVersion: 1,
    kind: "preproduction_material_plan",
    purpose: "锁定覆盖全片所需的高复用母素材、前期准备、采集路径、验收与缺口处理；不分配人员或绑定制作工具。",
    principles: [
      "采集顺序不等于成片顺序；一条高信息密度母素材可以拆分、复用和乱序使用。",
      "真实功能、操作和结果是独立的核心证明素材，不能由模拟 UI 或生成画面代替。",
      "B-roll 和图形按母素材组规划，只承担解释、节奏或转场。",
    ],
    lockedInputs: ["分镜稿、口播台词稿和口播录制执行稿已锁定；本文件不重复编写它们。"],
    environmentAndContinuity: unique(master.assetPlan.sourceAssets.flatMap((source) => source.constraints)),
    materialGroups: requirements.requirements.map((requirement, index) => {
      const source = sources.get(requirement.sourceAssetId);
      if (!source) throw new Error(`Requirement ${requirement.requirementId} has no source asset in the locked master.`);
      return {
      id: `M${String(index + 1).padStart(2, "0")}`,
      requirementId: requirement.requirementId,
      sourceAssetId: requirement.sourceAssetId,
      materialType: requirement.materialType,
      purpose: source.purpose,
      evidenceRole: source.evidenceRole,
      productionIntent: source.productionIntent,
      constraints: requirement.constraints,
      reuseCount: requirement.reuseCount,
      coveredUsages: requirement.usages,
      reusableFragments: source.reusableFragments,
      captureProtocol: source.captureProtocol,
      realityBoundary: source.captureProtocol.captureMode === "generative" || source.captureProtocol.captureMode === "postproduction"
        ? "仅可承担说明、节奏、转场或图形职责；不得伪装为真实产品、操作或结果。"
        : "可作为真实证据时，必须展示 captureProtocol.requiredVisibleStates。",
      fallback: source.captureProtocol.captureMode === "capture"
        ? "核心证明状态不可获取时，回流 Node 4 删除或改写主张；不可用图形代替。"
        : "仅在不改变事实边界时改用同等来源或后期表达。",
      };
    }),
    captureOrder: requirements.requirements
      .slice()
      .sort((left, right) => right.reuseCount - left.reuseCount || left.requirementId.localeCompare(right.requirementId))
      .map((requirement) => requirement.requirementId),
    preflight: [
      "统一项目名、账号/空间、测试状态、界面主题、字号与画幅；关闭通知并清理敏感信息。",
      "先试跑真实证明链；只有可稳定重复的状态才能进入正式录制。",
      "按 materialGroups 的连续路径采集，先完成高复用核心证明素材，再补 B-roll、图形和声音。",
    ],
    acceptance: [
      "每个主稿使用位恰好被一个素材组覆盖。",
      "每个素材组都有用途、证明角色、连续路径、可见状态、剪辑余量、备份和降级边界。",
      "高复用、真实证明素材优先采集；没有明确使用位的一次性拍摄被删除。",
      "隐私、版权、连续性和事实约束可在每个素材组中追溯。",
    ],
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function outlineBeat(segment: VideoOutline["segments"][number], index: number) {
  return {
    id: segment.id,
    order: index + 1,
    durationSeconds: segment.durationSeconds,
    narrativeTask: segment.segmentPurpose,
    spokenDirection: segment.spokenFunction,
    presenterRole: segment.speaker,
    presenterAction: segment.speakerAction,
    visualPromise: segment.visualFunction ?? segment.presentation,
    proofTarget: segment.evidence,
    transition: segment.transition,
  };
}
