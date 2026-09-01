import assert from "node:assert/strict";
import test from "node:test";

import {
  createArticleAssetManifest,
  createArticleDocument,
  createArticleProductionArtifacts,
  createProductionUnitPlan,
  getArticleReviewGate,
  getProductionControl,
  renderArticlePreview,
  transitionProductionUnit,
} from "../dist/production.js";

const requirements = [
  { requirementId: "req_real", sourceAssetId: "product-screen", materialType: "screen_capture", constraints: ["actual product evidence"], usages: [], coverageUsageIds: ["u1"], reuseCount: 1 },
  { requirementId: "req_motion", sourceAssetId: "motion-idea", materialType: "transition", constraints: ["non-factual atmosphere"], usages: [], coverageUsageIds: ["u2"], reuseCount: 1 },
  { requirementId: "req_caption", sourceAssetId: "caption-source", materialType: "caption", constraints: ["format conversion"], usages: [], coverageUsageIds: ["u3"], reuseCount: 1 },
];

const branch = {
  id: "branch_wechat_1",
  parentMasterRevision: "artifact_master_1",
  platform: "wechat",
  platformProfileId: "wechat-article",
  platformProfileVersion: "2026-09-01",
  createdAt: "2026-09-01T00:00:00.000Z",
};

const profile = {
  id: "wechat-article",
  platform: "wechat",
  version: "2026-09-01",
  constraints: [],
  renderPreset: { id: "wechat-readable", mode: "preview_analogue", description: "Readable local article preview" },
  sources: [],
  updatedAt: "2026-09-01T00:00:00.000Z",
};

test("routes unsatisfied requirements minimally and keeps accepted reuse out of units", () => {
  const plan = createProductionUnitPlan({
    requirements,
    acceptedSourceAssetIds: ["caption-source"],
    supportedRoutes: ["human", "generative", "local"],
  });
  assert.deepEqual(plan.reusedRequirementIds, ["req_caption"]);
  assert.deepEqual(plan.units.map((unit) => [unit.requirementIds[0], unit.route, unit.status]), [
    ["req_motion", "generative", "queued"],
    ["req_real", "human", "waiting_human"],
  ]);
  const control = getProductionControl(plan.units);
  assert.equal(control.pendingAction?.kind, "produce");
  assert.match(control.pendingAction?.id ?? "", /unit_req_real/);
});

test("production unit lifecycle cannot bypass review or reopen acceptance", () => {
  const unit = { id: "unit_one", requirementIds: ["req_one"], route: "generative", status: "queued", dependencies: [] };
  const active = transitionProductionUnit(unit, "active");
  const reviewed = transitionProductionUnit(active, "review");
  assert.equal(transitionProductionUnit(reviewed, "accepted").status, "accepted");
  assert.throws(() => transitionProductionUnit(unit, "accepted"), /cannot move/);
});

test("article preview, manifest, review gate and artifact bundle preserve one reviewable revision", () => {
  const document = createArticleDocument({
    id: "doc_1",
    revision: 2,
    branch,
    createdAt: "2026-09-01T00:00:00.000Z",
    blocks: [
      { id: "h1", type: "heading", content: "把证据放回正文", assetId: null, sourceMasterRef: "master:body:1" },
      { id: "p1", type: "paragraph", content: "这是一段可审查的正文。", assetId: null, sourceMasterRef: "master:body:2" },
      { id: "img1", type: "image", content: "产品截图", assetId: "asset_ui_1", sourceMasterRef: "master:placement:1" },
      { id: "cta1", type: "cta", content: "查看完整流程。", assetId: null, sourceMasterRef: "master:cta" },
    ],
  });
  const manifest = createArticleAssetManifest(document, [{
    assetId: "asset_ui_1", route: "accepted", sourceArtifactIds: ["artifact_capture_1"], evidenceRole: "product evidence", constraints: [],
  }]);
  const preview = renderArticlePreview(document, profile);
  assert.match(preview.html, /data-platform="wechat"/);
  assert.match(preview.html, /asset_ui_1/);

  const readyUnits = [{ id: "unit_asset", requirementIds: ["req_real"], route: "human", status: "accepted", dependencies: [] }];
  const needsReview = getArticleReviewGate({ units: readyUnits, document, manifest, previewAccepted: false, uncertainty: { factual_evidence: true } });
  assert.equal(needsReview.pendingAction?.kind, "review");
  assert.equal(getArticleReviewGate({ units: readyUnits, document, manifest, previewAccepted: true }).canLock, true);

  const documentArtifact = artifact("artifact_document_1", "article_document", []);
  const bundle = createArticleProductionArtifacts({
    documentArtifact,
    previewArtifact: artifact("artifact_preview_1", "preview", [documentArtifact.artifactId]),
    assetManifestArtifact: artifact("artifact_manifest_1", "asset_manifest", [documentArtifact.artifactId]),
    documentRevision: 2,
    previewDocumentRevision: 2,
    assetManifestDocumentRevision: 2,
  });
  assert.equal(bundle.previewArtifactId, "artifact_preview_1");
});

function artifact(artifactId, kind, parentArtifactIds) {
  return { artifactId, kind, mediaType: "application/json", contentHash: "hash", revision: 1, createdAt: "2026-09-01T00:00:00.000Z", parentArtifactIds };
}
