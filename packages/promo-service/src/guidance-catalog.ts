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
      { id: "storyboard", title: "分镜稿样本", content: PROMO_GUIDANCE_DOCUMENTS.exemplarStoryboard },
      { id: "recording-execution", title: "口播录制执行稿样本", content: PROMO_GUIDANCE_DOCUMENTS.exemplarRecordingExecution },
      { id: "spoken-lines", title: "口播台词稿样本", content: PROMO_GUIDANCE_DOCUMENTS.exemplarSpokenLines },
      { id: "minimal-materials", title: "最小化素材清单样本", content: PROMO_GUIDANCE_DOCUMENTS.exemplarMinimalMaterials },
      { id: "remaining-materials", title: "剩余素材需求稿样本", content: PROMO_GUIDANCE_DOCUMENTS.exemplarRemainingMaterials },
    ],
  },
};

export function loadGuidance(ids: readonly GuidanceId[]): GuidanceGuide[] {
  return ids.map((id) => CATALOG[id]);
}
