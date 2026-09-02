import type { GuidanceId } from "./agent-work.js";
import { PROMO_GUIDANCE_DOCUMENTS } from "./guidance-content.js";

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
  "promo-workflow-orchestration": {
    id: "promo-workflow-orchestration",
    title: "Promo Workflow Orchestration",
    content: PROMO_GUIDANCE_DOCUMENTS.orchestration,
    resources: [],
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
  "appso-article-contract": appsoGuide("appso-article-contract", "AppSo Article Contract", "锁定推文的读者决定、人文中心、作者立场、贯穿线、情绪弧与证据姿态。缺少真实生活细节时，明确它是编辑选择或请求补充，而不是虚构回忆。", ["authorial-warmth", "evidence-standard"]),
  "appso-human-center-outline": appsoGuide("appso-human-center-outline", "AppSo Human-center Outline", "用已锁定的人文中心选择最小文章路线，并将贯穿线、情绪推进、段落职责、开场与视觉证明安排进大纲。", ["authorial-warmth", "product-review-route", "update-explainer-route", "technology-explainer-route", "recommendation-route", "voice-and-structure", "annotated-sample-cards"]),
  "appso-manuscript-proof": appsoGuide("appso-manuscript-proof", "AppSo Manuscript and Proof", "扩写文章主稿时，让作者像一个诚实的思考者存在，而不是把第一人称、情绪或热闹口号当作温度；每个重要判断仍要有比例适当的支持。", ["authorial-warmth", "evidence-standard", "voice-and-structure", "qa-scorecard"]),
  "appso-visual-proof": appsoGuide("appso-visual-proof", "AppSo Visual Proof", "规划或制作文章素材时，把每张截图、录屏或图示绑定到紧邻的主张和可观察结果；不能用装饰图冒充真实产品证明。", ["evidence-standard", "voice-and-structure"]),
  "appso-preview-review": appsoGuide("appso-preview-review", "AppSo Preview Review", "审阅本地文章预览时，检查素材是否仍在正确锚点之后、标题和结尾是否兑现正文，以及排版有没有把文章变冷或变成功能清单。", ["authorial-warmth", "voice-and-structure", "qa-scorecard"]),
  "appso-release-packaging": appsoGuide("appso-release-packaging", "AppSo Release Packaging", "为已锁定文章写标题、摘要和封面语；承诺不能超过正文证据，结尾余味必须由文章已经建立的观察赚得。", ["voice-and-structure", "qa-scorecard"]),
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
};

function appsoGuide(
  id: GuidanceId,
  title: string,
  stageInstruction: string,
  resourceIds: readonly string[],
): GuidanceGuide {
  return {
    id,
    title,
    content: `${PROMO_GUIDANCE_DOCUMENTS.appsoProductEditor}\n\n## 当前节点\n\n${stageInstruction}`,
    resources: PROMO_GUIDANCE_DOCUMENTS.appsoProductEditorResources.filter((resource) => resourceIds.includes(resource.id)),
  };
}

export function loadGuidance(ids: readonly GuidanceId[]): GuidanceGuide[] {
  return ids.map((id) => CATALOG[id]);
}
