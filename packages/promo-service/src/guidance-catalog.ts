import type { GuidanceId } from "./agent-work.js";

export interface GuidanceGuide {
  id: GuidanceId;
  title: string;
  instructions: readonly string[];
}

const CATALOG: Record<GuidanceId, GuidanceGuide> = {
  "promo-workflow-orchestration": {
    id: "promo-workflow-orchestration",
    title: "Promo Workflow Orchestration",
    instructions: [
      "Treat the local Promo Workflow service as the workflow authority. Start from promo_get and follow the returned pendingAction and agentWork.",
      "Use promo_run only for the automatic transition it exposes. Use promo_commit only for the named decision or submission requested by the capsule.",
      "Preserve expectedRevision. Reuse an idempotencyKey only when retrying the exact same action.",
      "Do not skip locks, overwrite an existing artifact, or infer a later-stage decision.",
      "Read the declared workspace deliverables before reworking a later node. A Grill answer must be followed by a revised deliverable that incorporates its decision id.",
      "Use a maximum of one consequential Grill question at a time. Fix local wording or craft directly instead of escalating it as a decision.",
    ],
  },
  "promo-writing-supervision": {
    id: "promo-writing-supervision",
    title: "Promo Writing Supervision",
    instructions: [
      "Anchor the work in one practical reader task, an observable mechanism, and bounded author judgment. The locked campaign intent and selected materials are the evidence boundary.",
      "For an outline, make the opening scene, tension, proof plan, reader shift, and ending move distinct. Do not produce a feature-list sequence or polish the full manuscript prematurely.",
      "For a master, every paragraph or passage needs a distinct job: action, explanation, proof, limitation, or synthesis. Let the immediate reader gain lead before the longer-term value when the campaign intent says so.",
      "Keep important claims traceable: task or constraint -> product action -> observable result -> bounded conclusion. Do not invent use, results, testimonials, metrics, or independent reviews.",
      "Use a restrained builder, curious tester, skeptical reviewer, or explanatory-media voice. Remove stock contrast formulas, pseudo-conversation, abstract padding, inflated metaphors, and defensive prebuttals.",
      "Before submission, verify that the practical problem anchors the piece, every major feature serves it, boundaries sit next to the claims they limit, and there is at most one primary CTA.",
    ],
  },
  "promo-storyboard-supervision": {
    id: "promo-storyboard-supervision",
    title: "Promo Storyboard Supervision",
    instructions: [
      "Build a continuous, time-aligned storyboard from the locked creative outline. Each shot must have a visual function, evidence role, and clear transition into the next beat.",
      "Use direct-to-camera speaking only when its concrete function is clear: product explanation, founder perspective, user experience, instruction, or judgment. Do not force speech to fill every second.",
      "Balance speaking, B-roll, screen evidence, and transitions around what each beat must prove. Keep factual product, people, interview, and screen-capture evidence reviewable.",
      "Plan assets as source asset -> reusable fragment -> usage. Reuse a source where meaningful; name the reason for a necessary one-off shot.",
      "Fix local continuity, coverage, timing, and reuse issues directly. Grill only choices that alter factual claims, speaker position, overall rhythm, or material burden across multiple beats.",
      "Return the requested storyboard and review fields. Subtitle production, material requirements, editing, and final export belong to later nodes.",
    ],
  },
};

export function loadGuidance(ids: readonly GuidanceId[]): GuidanceGuide[] {
  return ids.map((id) => CATALOG[id]);
}
