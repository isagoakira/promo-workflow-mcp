import type { GuidanceId } from "./agent-work.js";
import { EDITORIAL_REVIEW_GUIDANCE } from "./editorial-guidance.js";
import { PROMO_GUIDANCE_DOCUMENTS } from "./guidance-content.js";
import {
  TIM_CINEMATIC_VIDEO_ARCHITECTURE_GUIDANCE,
  TIM_CINEMATIC_VIDEO_INTENT_GUIDANCE,
  TIM_CINEMATIC_VIDEO_PROOF_PLAN_GUIDANCE,
} from "./tim-cinematic-guidance.js";

export interface GuidanceResource {
  id: string;
  title: string;
  content: string;
}

export interface GuidanceGuide {
  id: GuidanceId;
  title: string;
  /** Canonical full skill text, not a condensed prompt summary. */
  content: string;
  resources: readonly GuidanceResource[];
}

const CATALOG: Record<GuidanceId, GuidanceGuide> = {
  "human-language-writing": {
    id: "human-language-writing",
    title: "人话写作监督",
    content: PROMO_GUIDANCE_DOCUMENTS.humanLanguageWriting,
    resources: PROMO_GUIDANCE_DOCUMENTS.humanLanguageWritingResources,
  },
  "promo-writing-supervision": {
    id: "promo-writing-supervision",
    title: "Promo Writing Supervision",
    content: PROMO_GUIDANCE_DOCUMENTS.writing,
    resources: [
      { id: "promo-writing-supervision", title: "Workflow Writing Supervision", content: PROMO_GUIDANCE_DOCUMENTS.writingWrapper },
      { id: "sentence-level-style", title: "中文句子级去 AI 味规则", content: PROMO_GUIDANCE_DOCUMENTS.sentence },
      { id: "evidence-and-voice", title: "证据链与作者声音", content: PROMO_GUIDANCE_DOCUMENTS.evidence },
      { id: "public-account", title: "公众号写作与排版", content: PROMO_GUIDANCE_DOCUMENTS.publicAccount },
      { id: "video-package", title: "视频口播与跨平台包装", content: PROMO_GUIDANCE_DOCUMENTS.videoPackage },
    ],
  },
  "product-tweet-article-contract": productTweetGuide("product-tweet-article-contract", "APPSO 风格文章契约", "把文风控制胶囊的稳定上游部分映射到 articleEditorialIntent：编辑目光与人文中心、叙述人格与权限、读者决定、温度主线、注意力与情绪变化、事实边界。此节点不写大纲或成稿。", ["appso-style-model", "style-control-capsule", "authorial-warmth", "evidence-standard"]),
  "product-tweet-human-center-outline": productTweetGuide("product-tweet-human-center-outline", "APPSO 风格文章大纲", "选择一个主导子类型，把已锁定的编辑意图展开为注意力动线、比例带、段落职责、转场、开场和视觉证明；比例是注意力预算，不是硬性章节配额。", ["appso-style-model", "style-control-capsule", "structure-and-proportion", "product-review-route", "update-explainer-route", "technology-explainer-route", "recommendation-route", "annotated-sample-cards"]),
  "product-tweet-manuscript-proof": productTweetGuide("product-tweet-manuscript-proof", "APPSO 风格文章主稿", "在锁定事实和大纲内完成宏观、中观、微观三层迁移。作者通过选择、节奏、反应与有边界的判断在场；量化是可选证据，不是文章引擎。提交前先过真实门，再做整体文风审查。", ["appso-style-model", "authorial-warmth", "evidence-standard", "structure-and-proportion", "style-migration-protocol", "voice-and-structure", "style-similarity-audit"]),
  "product-tweet-visual-proof": productTweetGuide("product-tweet-visual-proof", "APPSO 风格视觉证明", "把截图、录屏和图示放在读者刚需要看清产品行为的位置，并绑定紧邻的判断、解释或节奏职责；真实界面和结果不能用装饰图替代。", ["evidence-standard", "structure-and-proportion", "voice-and-structure"]),
  "product-tweet-preview-review": productTweetGuide("product-tweet-preview-review", "APPSO 风格预览审查", "检查排版后的编辑目光、叙述者距离、温度主线、注意力动线、段落呼吸、句子声音和证据锚点。按最早漂移层给出回流位置，不在预览节点静默重写语义。", ["appso-style-model", "style-control-capsule", "style-similarity-audit", "evidence-standard"]),
  "product-tweet-release-packaging": productTweetGuide("product-tweet-release-packaging", "APPSO 风格发布包装", "标题、摘要和封面语只压缩正文已建立的编辑目光、可见条件、读者决定和余味；不得新增命题、强度或未被正文证明的数字。", ["appso-style-model", "voice-and-structure", "style-similarity-audit"]),
  "promo-storyboard-supervision": {
    id: "promo-storyboard-supervision",
    title: "Promo Storyboard Supervision",
    content: PROMO_GUIDANCE_DOCUMENTS.storyboard,
    resources: [],
  },
  "product-voiceover-campaign": {
    id: "product-voiceover-campaign",
    title: "Product Voiceover Campaign",
    content: PROMO_GUIDANCE_DOCUMENTS.voiceoverCampaign,
    resources: [],
  },
  "promo-deliverable-exemplars": {
    id: "promo-deliverable-exemplars",
    title: "Promo Deliverable Exemplars",
    content: PROMO_GUIDANCE_DOCUMENTS.deliverableExemplarsGuide,
    resources: [
      { id: "video-delivery-contract", title: "视频前期交付模板契约", content: PROMO_GUIDANCE_DOCUMENTS.videoDeliveryContract },
      { id: "outline-script", title: "大纲脚本样本", content: PROMO_GUIDANCE_DOCUMENTS.exemplarOutlineScript },
      { id: "storyboard", title: "分镜稿样本", content: PROMO_GUIDANCE_DOCUMENTS.exemplarStoryboard },
      { id: "recording-execution", title: "口播录制执行稿样本", content: PROMO_GUIDANCE_DOCUMENTS.exemplarRecordingExecution },
      { id: "spoken-lines", title: "口播台词稿样本", content: PROMO_GUIDANCE_DOCUMENTS.exemplarSpokenLines },
      { id: "preproduction-material-plan", title: "前期素材执行包样本", content: PROMO_GUIDANCE_DOCUMENTS.exemplarPreproductionMaterialPlan },
    ],
  },
  "tim-cinematic-video-intent": {
    id: "tim-cinematic-video-intent",
    title: "技术影像：视频意图",
    content: TIM_CINEMATIC_VIDEO_INTENT_GUIDANCE.content,
    resources: TIM_CINEMATIC_VIDEO_INTENT_GUIDANCE.resources,
  },
  "tim-cinematic-video-architecture": {
    id: "tim-cinematic-video-architecture",
    title: "技术影像：叙事架构",
    content: TIM_CINEMATIC_VIDEO_ARCHITECTURE_GUIDANCE.content,
    resources: TIM_CINEMATIC_VIDEO_ARCHITECTURE_GUIDANCE.resources,
  },
  "tim-cinematic-video-proof-plan": {
    id: "tim-cinematic-video-proof-plan",
    title: "技术影像：证据与前期计划",
    content: TIM_CINEMATIC_VIDEO_PROOF_PLAN_GUIDANCE.content,
    resources: TIM_CINEMATIC_VIDEO_PROOF_PLAN_GUIDANCE.resources,
  },
};

function productTweetGuide(
  id: GuidanceId,
  title: string,
  stageInstruction: string,
  resourceIds: readonly string[],
): GuidanceGuide {
  return {
    id,
    title,
    content: `${PROMO_GUIDANCE_DOCUMENTS.productTweetEditor}\n\n## 当前节点\n\n${stageInstruction}`,
    resources: PROMO_GUIDANCE_DOCUMENTS.productTweetEditorResources.filter((resource) => resourceIds.includes(resource.id)),
  };
}

export function loadGuidance(ids: readonly GuidanceId[]): GuidanceGuide[] {
  return ids.map((id) => ({ ...CATALOG[id], content: CATALOG[id].content + EDITORIAL_REVIEW_GUIDANCE }));
}
