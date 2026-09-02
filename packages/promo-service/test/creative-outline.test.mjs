import assert from "node:assert/strict";
import test from "node:test";

import {
  assertOutlineGrillCapacity,
  canAskOutlineGrillQuestion,
  createCreativeOutlineBrief,
  getOutlineGrillCap,
  readCreativeOutlineDraft,
} from "../dist/creative-outline.js";

const baseline = {
  topicId: "topic_1",
  coreMessage: "A dependable local workflow makes agents useful beyond demos.",
  guidanceIntent: "Help product teams recognize repeatable operations.",
  confirmedAt: "2026-09-01T00:00:00.000Z",
};

const creativeSpine = {
  routeId: "route-1",
  creativePremise: "Follow one fragile agent run until it becomes repeatable.",
  storyEngine: "before-after-workflow",
  narrativeAnchor: "A release that failed when its state disappeared.",
  openingMove: "Start with the failed rerun.",
  progression: "Expose the failure, introduce local state, then verify the new loop.",
  proofPlan: "Use the observed failure and a repeatable rerun as evidence.",
  endingMove: "Leave the reader with a concrete next workflow to try.",
  macroStyle: {
    speakerPosition: "builder",
    readerRelationship: "peer",
    promotionalTemperature: "measured",
    technicalDepth: "practical",
    emotionalArc: "friction to confidence",
    endingAltitude: "next action",
  },
};

const macroStyleReview = {
  skill: "geek-product-promo-writing",
  scope: "macro",
  passed: true,
  findings: [],
};

test("creates an agent capsule for a budgeted creative outline", () => {
  const capsule = createCreativeOutlineBrief({
    topicId: "topic_1",
    baseline,
    selectedMaterials: ["artifact_topic_cards_1"],
    productProfile: { productName: "Promo workflow" },
    budget: {
      carrier: "video",
      tier: "short",
      targetMinutes: 2,
      targetDurationSeconds: 120,
      beatRange: [4, 4],
      targetGrillQuestionRange: [2, 3],
    },
    selectedRoute: creativeRoute(),
  });

  assert.equal(capsule.stage, "creative_outline");
  assert.equal(capsule.nextCommitKind, "submit_outline_draft");
  assert.deepEqual(capsule.guidance, { plugin: "promo-workflow-guidance", skills: ["promo-writing-supervision"] });
  assert.equal(capsule.inputs.recommendedStoryEngine, "single-task-evidence-chain");
  assert.match(capsule.constraints.join("\n"), /120 seconds/);
});

test("accepts a video outline only when beats and final duration match its budget", () => {
  const budget = {
    carrier: "video",
    tier: "short",
    targetMinutes: 2,
    targetDurationSeconds: 120,
    beatRange: [4, 4],
    targetGrillQuestionRange: [2, 3],
  };
  const draft = readCreativeOutlineDraft({
    selectedRouteId: "route-1",
    incorporatesDecisionIds: [],
    pendingQuestion: null,
    creativeSpine,
    macroStyleReview,
    outline: {
      carrier: "video",
      hookAndFirstFrame: "The rerun is already broken.",
      segments: [
        videoSegment("hook", 20, "Reveal the failed rerun."),
        videoSegment("problem", 30, "Show what state loss costs."),
        videoSegment("method", 40, "Explain local workflow state."),
        videoSegment("proof", 30, "Verify the new rerun and invite action."),
      ],
      unsupportedClaims: [],
      ending: "Try the next workflow locally.",
      primaryCallToAction: "Run one repeatable local workflow.",
    },
  }, budget);

  assert.equal(draft.outline.carrier, "video");

  assert.throws(() => readCreativeOutlineDraft({
    selectedRouteId: "route-1",
    incorporatesDecisionIds: [],
    pendingQuestion: null,
    creativeSpine,
    macroStyleReview,
    outline: {
      ...draft.outline,
      segments: draft.outline.segments.map((segment, index) => index === 0
        ? { ...segment, durationSeconds: 21 }
        : segment),
    },
  }, budget), /must total 120 seconds/);
});

test("requires article section purposes to be distinct and obeys Grill caps", () => {
  const budget = {
    carrier: "article",
    tier: "standard",
    targetChineseCharacterRange: [2000, 3500],
    beatRange: [5, 7],
    targetGrillQuestionRange: [3, 5],
  };
  const sections = [
    articleSection("scene", "Set the scene."),
    articleSection("failure", "Show the failed rerun."),
    articleSection("mechanism", "Explain local state."),
    articleSection("evidence", "Show the rerun result."),
    articleSection("judgment", "State why this matters."),
  ];
  const draft = readCreativeOutlineDraft({
    selectedRouteId: "route-1",
    incorporatesDecisionIds: [],
    pendingQuestion: null,
    creativeSpine,
    macroStyleReview,
    outline: {
      carrier: "article",
      openingDirection: "Begin at the failed rerun.",
      sections,
      titleDirections: ["When an agent rerun stops being a gamble"],
      unsupportedClaims: [],
      ending: "Start with one workflow you can rerun tomorrow.",
      primaryCallToAction: null,
    },
  }, budget);
  assert.equal(draft.outline.carrier, "article");

  assert.throws(() => readCreativeOutlineDraft({
    selectedRouteId: "route-1",
    incorporatesDecisionIds: [],
    pendingQuestion: null,
    creativeSpine,
    macroStyleReview,
    outline: {
      ...draft.outline,
      sections: [
        ...draft.outline.sections.slice(0, 4),
        { ...articleSection("evidence-again", "Repeat it."), sectionPurpose: "evidence" },
      ],
    },
  }, budget), /duplicate sectionPurpose/);

  assert.equal(getOutlineGrillCap(budget), 5);
  assert.equal(canAskOutlineGrillQuestion(4, budget), true);
  assert.equal(canAskOutlineGrillQuestion(5, budget), false);
  assert.throws(() => assertOutlineGrillCapacity(5, budget), /Grill limit reached/);
});

function videoSegment(id, durationSeconds, segmentPurpose) {
  return {
    id,
    durationSeconds,
    segmentPurpose,
    speaker: null,
    speakerAction: null,
    spokenFunction: null,
    presentation: "mixed",
    visualFunction: null,
    evidence: [],
    transition: null,
  };
}

function articleSection(id, content) {
  return {
    id,
    sectionPurpose: id,
    sceneOrAction: `${id} action`,
    content,
    readerShift: null,
    evidence: [],
    authorJudgment: null,
    transition: null,
    visualAsset: null,
  };
}

function creativeRoute() {
  return {
    id: "route-1",
    name: "Failed rerun",
    centralTension: "A new run loses the prior decision.",
    openingScene: "A builder restates project constraints.",
    proofMethod: "Show a recovered record.",
    readerShift: "Move from repetition to recall.",
    whyThisRoute: "It makes the immediate cost visible.",
  };
}
