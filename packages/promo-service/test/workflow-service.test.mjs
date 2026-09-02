import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ArtifactStore, JsonWorkflowStore, WorkflowService, WorkspaceDeliverables } from "../dist/index.js";

test("workflow advances with optimistic revisions and idempotency", async () => {
  const directory = await mkdtemp(join(tmpdir(), "promo-workflow-"));
  const artifacts = new ArtifactStore(join(directory, "artifacts"));
  const service = new WorkflowService(
    new JsonWorkflowStore(join(directory, "workflows.json")),
    artifacts,
    undefined,
    undefined,
    undefined,
    new WorkspaceDeliverables(join(directory, "workspace"), artifacts),
  );

  const created = await service.create({
    carrier: "article",
    summary: "Test workflow",
    context: {
      productProfile: {
        productName: "Demo",
        positioning: "agent workflow automation",
        capabilities: ["MCP state control"],
        activeCampaignLines: ["reliable agent workflow", "local MCP state control"],
      },
      topicSources: [{ id: "demo", label: "Demo feed", kind: "rss", url: "https://example.com/feed.xml" }],
    },
    idempotencyKey: "create-1",
  });
  assert.equal(created.state, "READY");
  assert.equal(created.revision, 1);

  const prepared = await service.run({
    workflowId: created.workflowId,
    expectedRevision: created.revision,
    idempotencyKey: "run-1",
  });
  assert.equal(prepared.state, "FETCHING");
  assert.equal(prepared.fetchBrief.sources[0].id, "demo");

  const fetched = await service.commit({
    workflowId: created.workflowId,
    expectedRevision: prepared.revision,
    kind: "submit_fetched_topics",
    summary: "Fetched one card",
    context: {
      fetchedTopics: [{
        sourceId: "demo",
        title: "Reliable agent workflow needs local MCP state control",
        url: "https://example.com/topic-1",
        excerpt: "A practical case for agent workflow automation.",
      }],
    },
    idempotencyKey: "fetch-1",
  });
  assert.equal(fetched.state, "MATCHING");

  const matched = await service.run({
    workflowId: created.workflowId,
    expectedRevision: fetched.revision,
    idempotencyKey: "match-1",
  });
  assert.equal(matched.state, "AWAITING_SELECTION");
  assert.equal(matched.topicMatch.candidates.length, 1);
  assert.equal(matched.artifactRefs.length, 2);

  const selected = await service.commit({
    workflowId: created.workflowId,
    expectedRevision: matched.revision,
    kind: "select_topic",
    summary: "Selected topic",
    context: {
      topicId: matched.topicMatch.candidates[0].topicId,
      selectedMaterials: ["https://example.com/topic-1"],
    },
    idempotencyKey: "select-1",
  });
  assert.equal(selected.state, "TOPIC_LOCKED");

  const replay = await service.commit({
    workflowId: created.workflowId,
    expectedRevision: matched.revision,
    kind: "select_topic",
    summary: "Ignored replay",
    context: {},
    idempotencyKey: "select-1",
  });
  assert.deepEqual(replay, selected);

  const baselineStarted = await service.run({
    workflowId: created.workflowId,
    expectedRevision: selected.revision,
    idempotencyKey: "baseline-start-1",
  });
  assert.equal(baselineStarted.state, "ALIGNING_BASELINE");
  assert.equal(baselineStarted.agentWork.stage, "baseline_alignment");
  assert.deepEqual(baselineStarted.agentWork.guidance.policies.map((policy) => policy.id), ["promo-workflow-orchestration", "promo-writing-supervision"]);
  const guidance = await service.guidance(baselineStarted.workflowId);
  assert.deepEqual(guidance.guides.map((guide) => guide.id), ["promo-workflow-orchestration", "promo-writing-supervision"]);
  assert.match(guidance.guides[1].content, /Geek Product Promo Writing/);
  assert.equal(guidance.guides[1].resources.length, 5);
  assert.match(guidance.guides[1].resources[1].content, /中文句子级去 AI 味规则/);
  await assert.rejects(
    service.guidance(baselineStarted.workflowId, ["promo-storyboard-supervision"]),
    /不允许加载指导/,
  );

  const proposed = await service.commit({
    workflowId: created.workflowId,
    expectedRevision: baselineStarted.revision,
    kind: "propose_baseline",
    summary: "Proposed baseline",
    context: {
      baselineProposal: validBaselineProposal("Reliable workflow control turns agent demos into repeatable operations.", "Help product teams see when local state control makes agent work dependable.", baselineQuestion()),
    },
    idempotencyKey: "baseline-proposal-1",
  });
  assert.equal(proposed.state, "ALIGNING_BASELINE");

  const answered = await service.commit({
    workflowId: created.workflowId,
    expectedRevision: proposed.revision,
    kind: "answer_baseline_grill",
    summary: "Choose reliability",
    context: { questionId: "baseline-q1", answer: "Lead with reliability." },
    idempotencyKey: "baseline-answer-1",
  });
  const decisionId = answered.agentWork.inputs.latestDecision.id;
  const revised = await service.commit({
    workflowId: created.workflowId,
    expectedRevision: answered.revision,
    kind: "propose_baseline",
    summary: "Revised baseline",
    context: { baselineProposal: validBaselineProposal("Reliable workflow control turns agent demos into repeatable operations.", "Help product teams see when local state control makes agent work dependable.", undefined, [decisionId]) },
    idempotencyKey: "baseline-revision-1",
  });
  const baselineLocked = await service.commit({
    workflowId: created.workflowId,
    expectedRevision: revised.revision,
    kind: "lock_baseline",
    summary: "Locked baseline",
    context: {},
    idempotencyKey: "baseline-lock-1",
  });
  assert.equal(baselineLocked.state, "BASELINE_LOCKED");
  assert.equal(baselineLocked.artifactRefs.filter((artifact) => artifact.kind === "baseline").length, 1);
  const campaignIntent = baselineLocked.deliverables.find((deliverable) => deliverable.kind === "baseline");
  assert.ok(campaignIntent);
  assert.match(await readFile(campaignIntent.path, "utf8"), /campaignIntent/);

  await assert.rejects(
    service.run({
      workflowId: created.workflowId,
      expectedRevision: 1,
      idempotencyKey: "stale-run",
    }),
    /Revision conflict/,
  );
});

test("video workflow connects outline, master, requirements, production, and release packaging", async () => {
  const directory = await mkdtemp(join(tmpdir(), "promo-workflow-e2e-"));
  const service = new WorkflowService(
    new JsonWorkflowStore(join(directory, "workflows.json")),
    new ArtifactStore(join(directory, "artifacts")),
    undefined,
    {
      async run() {
        return {
          kind: "production_result",
          projectId: "cut-project-1",
          revision: 1,
          unitStatuses: [],
          verifiedOutputArtifactIds: ["video-render-1"],
          finalSubtitleArtifactId: "final-srt-1",
          finalGate: { passed: true, blockers: [], verifiedAt: "2026-09-01T00:00:00.000Z" },
        };
      },
    },
  );
  const created = await service.create({
    carrier: "video",
    summary: "End-to-end video",
    context: {
      contentTier: "short",
      productProfile: { productName: "Demo", positioning: "repeatable local workflows", capabilities: ["state control"], activeCampaignLines: ["make agent work repeatable", "keep promotion evidence-led"] },
      topicSources: [{ id: "feed", label: "Feed", kind: "rss", url: "https://example.com/feed.xml" }],
    },
    idempotencyKey: "e2e-create",
  });
  const fetching = await service.run({ workflowId: created.workflowId, expectedRevision: created.revision, idempotencyKey: "e2e-fetch-brief" });
  const matching = await service.commit({
    workflowId: created.workflowId, expectedRevision: fetching.revision, kind: "submit_fetched_topics", summary: "Topic cards",
    context: { fetchedTopics: [{ sourceId: "feed", title: "Local state makes agent workflows repeatable", url: "https://example.com/topic", excerpt: "A practical workflow topic." }] },
    idempotencyKey: "e2e-fetch-submit",
  });
  const candidates = await service.run({ workflowId: created.workflowId, expectedRevision: matching.revision, idempotencyKey: "e2e-match" });
  const selected = await service.commit({
    workflowId: created.workflowId, expectedRevision: candidates.revision, kind: "select_topic", summary: "Select topic",
    context: { topicId: candidates.topicMatch.candidates[0].topicId, selectedMaterials: ["https://example.com/topic"] }, idempotencyKey: "e2e-select",
  });
  const baseline = await service.run({ workflowId: created.workflowId, expectedRevision: selected.revision, idempotencyKey: "e2e-baseline-brief" });
  const proposed = await service.commit({
    workflowId: created.workflowId, expectedRevision: baseline.revision, kind: "propose_baseline", summary: "Propose baseline",
    context: { baselineProposal: validBaselineProposal("Local state makes one useful workflow repeatable.", "Invite builders to try a controlled rerun.") }, idempotencyKey: "e2e-propose",
  });
  const lockedBaseline = await service.commit({ workflowId: created.workflowId, expectedRevision: proposed.revision, kind: "lock_baseline", summary: "Lock baseline", context: {}, idempotencyKey: "e2e-lock-baseline" });
  const outlining = await service.run({ workflowId: created.workflowId, expectedRevision: lockedBaseline.revision, idempotencyKey: "e2e-outline-brief" });
  assert.equal(outlining.agentWork.stage, "creative_outline");
  const routes = await service.commit({ workflowId: created.workflowId, expectedRevision: outlining.revision, kind: "propose_creative_routes", summary: "Routes", context: { creativeRoutes: validCreativeRoutes() }, idempotencyKey: "e2e-routes" });
  const route = await service.commit({ workflowId: created.workflowId, expectedRevision: routes.revision, kind: "select_creative_route", summary: "Choose route", context: { routeId: "route-1" }, idempotencyKey: "e2e-route" });
  const outline = await service.commit({
    workflowId: created.workflowId, expectedRevision: route.revision, kind: "submit_outline_draft", summary: "Submit outline",
    context: { outlineDraft: validVideoOutlineDraft() }, idempotencyKey: "e2e-outline-draft",
  });
  const lockedOutline = await service.commit({ workflowId: created.workflowId, expectedRevision: outline.revision, kind: "lock_outline", summary: "Lock outline", context: {}, idempotencyKey: "e2e-lock-outline" });
  assert.equal(lockedOutline.artifactRefs.some((artifact) => artifact.kind === "outline_script"), true);
  const mastering = await service.run({ workflowId: created.workflowId, expectedRevision: lockedOutline.revision, idempotencyKey: "e2e-master-brief" });
  assert.equal(mastering.agentWork.stage, "master_development");
  const master = await service.commit({
    workflowId: created.workflowId, expectedRevision: mastering.revision, kind: "submit_master_draft", summary: "Submit master",
    context: { masterDraft: validVideoMasterDraft(), masterReview: validMasterReview("video") }, idempotencyKey: "e2e-master-draft",
  });
  assert.equal(master.artifactRefs.some((artifact) => artifact.kind === "master_review"), true);
  const lockedMaster = await service.commit({ workflowId: created.workflowId, expectedRevision: master.revision, kind: "lock_master", summary: "Lock master", context: {}, idempotencyKey: "e2e-lock-master" });
  assert.equal(lockedMaster.artifactRefs.some((artifact) => artifact.kind === "spoken_script"), true);
  assert.equal(lockedMaster.artifactRefs.some((artifact) => artifact.kind === "recording_execution"), true);
  const requirements = await service.run({ workflowId: created.workflowId, expectedRevision: lockedMaster.revision, idempotencyKey: "e2e-compile" });
  assert.equal(requirements.state, "REQUIREMENTS_READY");
  assert.equal(requirements.artifactRefs.some((artifact) => artifact.kind === "requirement_set"), true);
  assert.equal(requirements.artifactRefs.some((artifact) => artifact.kind === "preproduction_material_plan"), true);
  const producing = await service.run({ workflowId: created.workflowId, expectedRevision: requirements.revision, idempotencyKey: "e2e-production-plan" });
  assert.equal(producing.state, "PRODUCING");
  const updated = await service.commit({
    workflowId: created.workflowId, expectedRevision: producing.revision, kind: "update_production_units", summary: "Accept production units",
    context: {
      units: producing.agentWork.inputs.requirements.units.map((unit) => ({ ...unit, status: "accepted" })),
      productionResults: producing.agentWork.inputs.requirements.units.map((unit, index) => productionResult(unit.id, `artifact_production_${index + 1}`)),
    }, idempotencyKey: "e2e-production-update",
  });
  assert.equal(updated.artifactRefs.some((artifact) => artifact.kind === "production_checkpoint"), true);
  const rendered = await service.run({ workflowId: created.workflowId, expectedRevision: updated.revision, idempotencyKey: "e2e-video-render" });
  assert.equal(rendered.artifactRefs.some((artifact) => artifact.kind === "production_handoff"), true);
  const lockedProduction = await service.commit({
    workflowId: created.workflowId, expectedRevision: rendered.revision, kind: "lock_production", summary: "Lock production",
    context: {}, idempotencyKey: "e2e-production-lock",
  });
  const packaging = await service.run({ workflowId: created.workflowId, expectedRevision: lockedProduction.revision, idempotencyKey: "e2e-package-brief" });
  assert.equal(packaging.agentWork.stage, "release_packaging");
  const packageDraft = await service.commit({
    workflowId: created.workflowId, expectedRevision: packaging.revision, kind: "submit_release_package", summary: "Submit package",
    context: { releasePackageDraft: validVideoReleaseDraft() }, idempotencyKey: "e2e-package-draft",
  });
  const ready = await service.commit({
    workflowId: created.workflowId, expectedRevision: packageDraft.revision, kind: "select_release_package", summary: "Select package",
    context: { titleId: "title-1", coverId: "cover-1" }, idempotencyKey: "e2e-package-select",
  });
  assert.equal(ready.state, "RELEASE_READY");
  assert.equal(ready.artifactRefs.some((artifact) => artifact.kind === "release_package"), true);
});

test("article workflow assembles a local preview before production lock and release packaging", async () => {
  const directory = await mkdtemp(join(tmpdir(), "promo-workflow-article-e2e-"));
  const service = new WorkflowService(new JsonWorkflowStore(join(directory, "workflows.json")), new ArtifactStore(join(directory, "artifacts")));
  const created = await service.create({
    carrier: "article", summary: "End-to-end article",
    context: {
      contentTier: "short",
      productProfile: { productName: "Demo", positioning: "repeatable local workflows", capabilities: ["state control"], activeCampaignLines: ["make agent work repeatable", "keep promotion evidence-led"] },
      topicSources: [{ id: "feed", label: "Feed", kind: "rss", url: "https://example.com/feed.xml" }],
      articlePlatformProfile: articlePlatformProfile(),
    }, idempotencyKey: "article-create",
  });
  const fetching = await service.run({ workflowId: created.workflowId, expectedRevision: created.revision, idempotencyKey: "article-fetch-brief" });
  const matching = await service.commit({ workflowId: created.workflowId, expectedRevision: fetching.revision, kind: "submit_fetched_topics", summary: "Topic", context: { fetchedTopics: [{ sourceId: "feed", title: "State makes a local workflow repeatable", url: "https://example.com/article-topic", excerpt: "Practical result." }] }, idempotencyKey: "article-fetch" });
  const candidates = await service.run({ workflowId: created.workflowId, expectedRevision: matching.revision, idempotencyKey: "article-match" });
  const selected = await service.commit({ workflowId: created.workflowId, expectedRevision: candidates.revision, kind: "select_topic", summary: "Select", context: { topicId: candidates.topicMatch.candidates[0].topicId, selectedMaterials: ["https://example.com/article-topic"] }, idempotencyKey: "article-select" });
  const baseline = await service.run({ workflowId: created.workflowId, expectedRevision: selected.revision, idempotencyKey: "article-baseline-brief" });
  const proposed = await service.commit({ workflowId: created.workflowId, expectedRevision: baseline.revision, kind: "propose_baseline", summary: "Baseline", context: { baselineProposal: validBaselineProposal("Local state preserves repeatable work.", "Show one useful rerun.") }, idempotencyKey: "article-baseline" });
  const lockedBaseline = await service.commit({ workflowId: created.workflowId, expectedRevision: proposed.revision, kind: "lock_baseline", summary: "Lock baseline", context: {}, idempotencyKey: "article-lock-baseline" });
  const outlining = await service.run({ workflowId: created.workflowId, expectedRevision: lockedBaseline.revision, idempotencyKey: "article-outline-brief" });
  const routes = await service.commit({ workflowId: created.workflowId, expectedRevision: outlining.revision, kind: "propose_creative_routes", summary: "Routes", context: { creativeRoutes: validCreativeRoutes() }, idempotencyKey: "article-routes" });
  const route = await service.commit({ workflowId: created.workflowId, expectedRevision: routes.revision, kind: "select_creative_route", summary: "Choose route", context: { routeId: "route-1" }, idempotencyKey: "article-route" });
  const draft = await service.commit({ workflowId: created.workflowId, expectedRevision: route.revision, kind: "submit_outline_draft", summary: "Outline", context: { outlineDraft: validArticleOutlineDraft() }, idempotencyKey: "article-outline" });
  const lockedOutline = await service.commit({ workflowId: created.workflowId, expectedRevision: draft.revision, kind: "lock_outline", summary: "Lock outline", context: {}, idempotencyKey: "article-lock-outline" });
  const mastering = await service.run({ workflowId: created.workflowId, expectedRevision: lockedOutline.revision, idempotencyKey: "article-master-brief" });
  const master = await service.commit({ workflowId: created.workflowId, expectedRevision: mastering.revision, kind: "submit_master_draft", summary: "Master", context: { masterDraft: validArticleMasterDraft(), masterReview: validMasterReview("article") }, idempotencyKey: "article-master" });
  assert.equal(master.artifactRefs.some((artifact) => artifact.kind === "master_review"), true);
  const lockedMaster = await service.commit({ workflowId: created.workflowId, expectedRevision: master.revision, kind: "lock_master", summary: "Lock master", context: {}, idempotencyKey: "article-lock-master" });
  const requirements = await service.run({ workflowId: created.workflowId, expectedRevision: lockedMaster.revision, idempotencyKey: "article-compile" });
  const producing = await service.run({ workflowId: created.workflowId, expectedRevision: requirements.revision, idempotencyKey: "article-produce-brief" });
  const updated = await service.commit({
    workflowId: created.workflowId, expectedRevision: producing.revision, kind: "update_production_units", summary: "Accept material",
    context: { units: producing.agentWork.inputs.requirements.units.map((unit) => ({ ...unit, status: "accepted" })), productionResults: producing.agentWork.inputs.requirements.units.map((unit, index) => productionResult(unit.id, `artifact_article_${index + 1}`)) },
    idempotencyKey: "article-accept",
  });
  assert.equal(updated.artifactRefs.some((artifact) => artifact.kind === "production_checkpoint"), true);
  const assembled = await service.run({ workflowId: created.workflowId, expectedRevision: updated.revision, idempotencyKey: "article-assemble" });
  assert.equal(assembled.artifactRefs.some((artifact) => artifact.kind === "article_document"), true);
  assert.equal(assembled.artifactRefs.some((artifact) => artifact.kind === "preview"), true);
  assert.equal(assembled.artifactRefs.some((artifact) => artifact.kind === "production_handoff"), true);
  const lockedProduction = await service.commit({ workflowId: created.workflowId, expectedRevision: assembled.revision, kind: "lock_production", summary: "Approve preview", context: { previewAccepted: true }, idempotencyKey: "article-lock-production" });
  const packaging = await service.run({ workflowId: created.workflowId, expectedRevision: lockedProduction.revision, idempotencyKey: "article-package-brief" });
  const evidence = packaging.agentWork.inputs.allowedEvidenceArtifactIds;
  const packaged = await service.commit({ workflowId: created.workflowId, expectedRevision: packaging.revision, kind: "submit_release_package", summary: "Package", context: { releasePackageDraft: validArticleReleaseDraft(evidence) }, idempotencyKey: "article-package" });
  const ready = await service.commit({ workflowId: created.workflowId, expectedRevision: packaged.revision, kind: "select_release_package", summary: "Select package", context: { titleId: "title-1", coverId: "cover-1" }, idempotencyKey: "article-select-package" });
  assert.equal(ready.state, "RELEASE_READY");
});

function validVideoOutlineDraft() {
  return {
    selectedRouteId: "route-1", incorporatesDecisionIds: [], pendingQuestion: null,
    creativeSpine: {
      routeId: "route-1", creativePremise: "Turn one failed rerun into a controlled loop.", storyEngine: "before-after-workflow", narrativeAnchor: "A workflow that forgets its own state.", openingMove: "Show the failed rerun.", progression: "Failure, method, proof, action.", proofPlan: "Use a recorded rerun.", endingMove: "Invite one controlled rerun.",
      macroStyle: { speakerPosition: "builder", readerRelationship: "peer", promotionalTemperature: "measured", technicalDepth: "practical", emotionalArc: "friction to confidence", endingAltitude: "next action" },
    },
    macroStyleReview: { skill: "geek-product-promo-writing", scope: "macro", passed: true, findings: [] },
    outline: {
      carrier: "video", hookAndFirstFrame: "The rerun forgot everything.",
      segments: ["hook", "problem", "method", "proof"].map((id, index) => ({ id, durationSeconds: [20, 30, 40, 30][index], segmentPurpose: id, speaker: null, speakerAction: null, spokenFunction: null, presentation: "mixed", visualFunction: null, evidence: [], transition: null })),
      unsupportedClaims: [], ending: "Run one workflow locally.", primaryCallToAction: "Try a controlled rerun.",
    },
  };
}

function validArticleOutlineDraft() {
  return {
    selectedRouteId: "route-1", incorporatesDecisionIds: [], pendingQuestion: null,
    creativeSpine: { routeId: "route-1", creativePremise: "Follow one rerun until it becomes reliable.", storyEngine: "before-after-workflow", narrativeAnchor: "The missing state.", openingMove: "Start with the interruption.", progression: "Problem, mechanism, evidence, judgment.", proofPlan: "Use one observed rerun.", endingMove: "Invite a repeatable next action.", macroStyle: { speakerPosition: "builder", readerRelationship: "peer", promotionalTemperature: "measured", technicalDepth: "practical", emotionalArc: "friction to confidence", endingAltitude: "next action" } },
    macroStyleReview: { skill: "geek-product-promo-writing", scope: "macro", passed: true, findings: [] },
    outline: { carrier: "article", openingDirection: "Start at the rerun.", sections: ["scene", "mechanism", "evidence", "judgment"].map((id) => ({ id, sectionPurpose: id, sceneOrAction: `${id} scene`, content: `${id} content`, readerShift: null, evidence: [], authorJudgment: null, avoid: null, transition: null, visualAsset: null })), titleDirections: ["A local rerun that keeps its state"], unsupportedClaims: [], ending: "Try one controlled rerun.", primaryCallToAction: "Start from one workflow." },
  };
}

function validBaselineProposal(coreMessage, guidanceIntent, pendingQuestion, incorporatesDecisionIds = []) {
  return {
    coreMessage, guidanceIntent, incorporatesDecisionIds,
    campaignIntent: {
      audienceMoment: "A builder opens a rerun and finds the project context gone.", immediateBenefit: "Continue from the last confirmed constraint.", longTermBenefit: "Reuse verified project decisions across later work.", beliefToChange: "A successful run is not enough if the next run starts from zero.", proofToShow: "One query-save-verify loop.", evidenceBoundary: "Only show recorded product behavior.", narratorPosition: "A peer builder sharing a practical test.", promotionalTemperature: "Measured and specific.", primaryCallToAction: "Try one small rerun.", avoid: ["feature inventory"],
    },
    ...(pendingQuestion ? { pendingQuestion } : {}),
  };
}

function baselineQuestion() {
  return {
    id: "baseline-q1",
    scene: "A developer begins a new task and pastes the same project context again.",
    tension: "The immediate cost is repetition, but the route could drift into abstract architecture.",
    prompt: "Which benefit should lead the piece?",
    options: [
      { id: "instant", label: "减少重复说明", rationale: "Makes the reader recognize the friction immediately." },
      { id: "long-term", label: "跨 Agent 复用", rationale: "Raises the long-term platform value." },
    ],
    recommendedOptionId: "instant",
    affectedDeliverables: ["campaign-intent", "creative-routes", "outline"],
  };
}

function validCreativeRoutes() {
  return [
    { id: "route-1", name: "The forgotten rerun", centralTension: "The task runs, but the next task forgets why.", openingScene: "A builder opens a new session and pastes the same project decisions again.", proofMethod: "Show one saved decision being recalled.", readerShift: "From repeating context to checking one reusable record.", whyThisRoute: "It makes the immediate friction visible." },
    { id: "route-2", name: "The visible memory loop", centralTension: "Trust requires a memory a user can inspect.", openingScene: "A user checks what an agent saved after a task.", proofMethod: "Show query, save, and web verification.", readerShift: "From black-box memory to reviewable project memory.", whyThisRoute: "It foregrounds evidence." },
  ];
}

function validMasterReview(carrier) {
  return {
    passed: true, evidenceBlockers: [], assetEfficiencyFindings: [],
    writingStyle: { skill: "geek-product-promo-writing", scope: "macro-meso-micro", passed: true, findings: ["Scene leads before mechanism."] },
    storyboardDirection: carrier === "video" ? { skill: "storyboard-direction", scope: "shot-continuity-coverage-assets", passed: true, findings: ["Continuity checked."] } : null,
  };
}

function validArticleMasterDraft() {
  const anchor = "这里展示状态保留后的实际结果";
  const body = `# 可复现的本地工作流\n\n${"一次工作流真正难的不是把它跑起来，而是让下一次仍能解释自己为什么这样运行。我们把状态、输入与结果留在同一条本地链路里，于是排查不再从猜测开始。".repeat(9)}\n\n${anchor}\n\n${"这不是功能清单，而是一段可以回看的操作记录：哪里中断、如何恢复、哪些结论仍需要人工确认，都保留在证据边界内。".repeat(8)}`;
  return {
    carrier: "article", title: "把一次演示变成可复现的工作流", alternativeTitles: ["让重跑保留状态", "本地状态如何减少猜测"], bodyMarkdown: body,
    assetPlacements: [{ id: "P01", anchor, assetUsageId: "usage-article", editorialPurpose: "Show the recorded product result." }], primaryCallToAction: "从一条可复现的流程开始。",
    assetPlan: { sourceAssets: [{ id: "source-screen", purpose: "Show the product result", evidenceRole: "actual product evidence", productionIntent: "product screen recording", captureProtocol: { captureMode: "capture", continuousPath: "Open the product, complete the test, hold the result.", requiredVisibleStates: ["product result"], editingHandles: "Hold the result for 3 seconds.", backupStrategy: "Record a clean backup." }, constraints: ["actual product evidence"], preferredRoute: "human", reusableFragments: [{ id: "fragment-result", sourceAssetId: "source-screen", extraction: "result", transformation: null }], usageIds: ["usage-article"], essentialOneOffReason: "The final proof frame is unique." }], usages: [{ id: "usage-article", carrier: "article", targetId: "P01", purpose: "Show result", sourceAssetId: "source-screen", fragmentId: "fragment-result" }], uniqueAcquisitionCount: 1, plannedUsageCount: 1, oneOffAssetIds: ["source-screen"] },
  };
}

function articlePlatformProfile() {
  return { id: "wechat-article", platform: "wechat", version: "1.0.0", constraints: [], renderPreset: { id: "wechat-readable", mode: "preview_analogue", description: "Readable local preview" }, sources: [], updatedAt: "2026-09-01T00:00:00.000Z" };
}

function validArticleReleaseDraft(evidence) {
  return { carrier: "article", titleCandidates: ["让一次重跑不再失忆", "本地状态才是可复现的底座", "把演示变成稳定流程"].map((title, index) => ({ id: `title-${index + 1}`, title, sourceArtifactIds: [evidence[0]] })), coverCandidates: [{ id: "cover-1", artifactId: "article-cover-1", sourceArtifactIds: [evidence[0]], brief: "Use the local preview as evidence." }, { id: "cover-2", artifactId: "article-cover-2", sourceArtifactIds: [evidence[1]], brief: "Show the reviewed workflow result." }], summaryDraft: { text: "从一次会丢失状态的重跑开始，记录怎样把操作和证据留在一条本地流程里。", sourceArtifactIds: [evidence[0], evidence[1]] } };
}

function validVideoMasterDraft() {
  const source = { id: "source-demo", purpose: "Show one workflow", evidenceRole: "recorded product evidence", productionIntent: "screen recording", captureProtocol: { captureMode: "capture", continuousPath: "Start the failed rerun, then complete a stable rerun.", requiredVisibleStates: ["failed rerun", "stable rerun"], editingHandles: "Pause 3 seconds before and after each result.", backupStrategy: "Record a second clean take." }, constraints: ["recorded proof only"], preferredRoute: "human", reusableFragments: [{ id: "fragment-a", sourceAssetId: "source-demo", extraction: "failure", transformation: null }, { id: "fragment-b", sourceAssetId: "source-demo", extraction: "result", transformation: null }], usageIds: ["usage-1", "usage-2"], essentialOneOffReason: null };
  return {
    carrier: "video", workingTitle: "Repeatable local workflows", targetDurationSeconds: 120,
    shots: [
      { id: "S01", timeRange: { startMs: 0, endMs: 60000 }, shotPurpose: "Show failure", spokenContent: "A workflow fails when it forgets its state.", spokenDelivery: "VO", recordingDirection: "State the observed failure over the real screen recording.", sound: null, visualAction: "Show the failed rerun.", composition: "Screen close-up", cameraBehavior: null, onScreenText: null, evidenceRefs: [], assetUsageIds: ["usage-1"], transition: null },
      { id: "S02", timeRange: { startMs: 60000, endMs: 120000 }, shotPurpose: "Show result", spokenContent: null, spokenDelivery: null, recordingDirection: null, sound: null, visualAction: "Show the stable rerun.", composition: "Screen close-up", cameraBehavior: null, onScreenText: null, evidenceRefs: [], assetUsageIds: ["usage-2"], transition: null },
    ],
    primaryCallToAction: "Try one controlled rerun.",
    assetPlan: { sourceAssets: [source], usages: [{ id: "usage-1", carrier: "video", targetId: "S01", purpose: "failure", sourceAssetId: "source-demo", fragmentId: "fragment-a" }, { id: "usage-2", carrier: "video", targetId: "S02", purpose: "result", sourceAssetId: "source-demo", fragmentId: "fragment-b" }], uniqueAcquisitionCount: 1, plannedUsageCount: 2, oneOffAssetIds: [] },
  };
}

function validVideoReleaseDraft() {
  return {
    carrier: "video",
    titleCandidates: ["让一次 Agent 重跑不再失忆", "本地状态如何让工作流可复现", "把演示变成可重复的流程"].map((title, index) => ({ id: `title-${index + 1}`, title, sourceArtifactIds: ["video-render-1"] })),
    coverCandidates: [{ id: "cover-1", artifactId: "cover-render-1", sourceArtifactIds: ["video-render-1"], brief: "Show the recorded rerun result." }, { id: "cover-2", artifactId: "cover-render-2", sourceArtifactIds: ["video-render-1"], brief: "Frame the controlled workflow." }],
    introductionDraft: { text: "从一次会失忆的重跑开始，展示如何把工作流留在可复现的本地状态里。", sourceArtifactIds: ["video-render-1"] },
  };
}

function productionResult(unitId, artifactId) {
  return {
    unitId,
    acceptedArtifactRefs: [{ artifactId, kind: "asset_plan", mediaType: "application/json", contentHash: `hash-${artifactId}`, revision: 1, createdAt: "2026-09-01T00:00:00.000Z", parentArtifactIds: [] }],
    provenanceNote: "Accepted by test production backend.",
    backendRevision: 1,
  };
}
