import assert from "node:assert/strict";
import test from "node:test";

import {
  createReleasePackagingBrief,
  getProductionArtifactIds,
  readReleasePackagingDraft,
  validateReleasePackagingDraft,
} from "../dist/release-packaging.js";

const articleProduction = {
  state: "PRODUCTION_LOCKED",
  carrier: "article",
  backend: {
    kind: "article_assembler",
    reference: {
      branchId: "branch-wechat",
      revision: 3,
      parentMasterRevision: "master-2",
      platform: "wechat",
      platformProfileId: "wechat-default",
      platformProfileVersion: "1.0.0",
    },
  },
  outputArtifacts: {
    documentArtifactId: "article-document-3",
    previewArtifactId: "article-preview-3",
    assetManifestArtifactId: "article-assets-3",
  },
  lockedAt: "2026-09-01T00:00:00.000Z",
};

const validArticleDraft = {
  carrier: "article",
  titleCandidates: [
    { id: "title-1", title: "让 Agent 的每次重跑都有记忆", sourceArtifactIds: ["article-document-3"] },
    { id: "title-2", title: "本地状态，才是可复现工作流的底座", sourceArtifactIds: ["article-document-3", "article-preview-3"] },
    { id: "title-3", title: "我们怎样把一次演示变成稳定流程", sourceArtifactIds: ["article-preview-3"] },
  ],
  coverCandidates: [
    { id: "cover-1", artifactId: "cover-artifact-1", sourceArtifactIds: ["article-preview-3"], brief: "Use the inspected local preview as the visual basis." },
    { id: "cover-2", artifactId: "cover-artifact-2", sourceArtifactIds: ["article-document-3"], brief: "Frame the documented workflow result without adding product claims." },
  ],
  summaryDraft: {
    text: "从一次会失忆的 Agent 重跑开始，展示如何把状态和版本留在本地工作流里。",
    sourceArtifactIds: ["article-document-3", "article-preview-3"],
  },
};

test("creates an evidence-bounded release-packaging capsule", () => {
  const capsule = createReleasePackagingBrief({
    production: articleProduction,
    evidenceSources: [{ artifactId: "topic-card-1", description: "The original selected source card." }],
    platformContext: { platform: "wechat" },
  });

  assert.equal(capsule.stage, "release_packaging");
  assert.equal(capsule.nextCommitKind, "submit_release_package");
  assert.deepEqual(capsule.guidance, { plugin: "promo-workflow-guidance", skills: ["promo-writing-supervision"] });
  assert.deepEqual(capsule.inputs.allowedEvidenceArtifactIds, [
    "article-document-3", "article-preview-3", "article-assets-3", "topic-card-1",
  ]);
  assert.match(capsule.constraints.join("\n"), /exactly three/i);
});

test("parses and accepts exactly three titles, two covers, and an evidence-linked article summary", () => {
  const draft = readReleasePackagingDraft(validArticleDraft);
  const result = validateReleasePackagingDraft(draft, {
    allowedEvidenceArtifactIds: getProductionArtifactIds(articleProduction),
  });

  assert.equal(draft.carrier, "article");
  assert.equal(result.passed, true);
  assert.deepEqual(result.errors, []);
});

test("rejects foreign evidence, duplicate titles, and an incomplete release package", () => {
  const draft = readReleasePackagingDraft({
    ...validArticleDraft,
    titleCandidates: [
      validArticleDraft.titleCandidates[0],
      { ...validArticleDraft.titleCandidates[1], title: validArticleDraft.titleCandidates[0].title },
    ],
    coverCandidates: [{ ...validArticleDraft.coverCandidates[0], sourceArtifactIds: ["foreign-artifact"] }],
    summaryDraft: { ...validArticleDraft.summaryDraft, sourceArtifactIds: [] },
  });
  const result = validateReleasePackagingDraft(draft, {
    allowedEvidenceArtifactIds: getProductionArtifactIds(articleProduction),
  });

  assert.equal(result.passed, false);
  assert.match(result.errors.join("\n"), /exactly 3 title/);
  assert.match(result.errors.join("\n"), /exactly 2 cover/);
  assert.match(result.errors.join("\n"), /Titles must be distinct/);
  assert.match(result.errors.join("\n"), /foreign-artifact/);
  assert.match(result.errors.join("\n"), /must cite at least one/);
});
