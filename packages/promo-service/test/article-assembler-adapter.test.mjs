import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArticleAssemblerOutput,
  createArticleAssemblerReference,
} from "../dist/article-assembler-adapter.js";

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

const master = {
  carrier: "article",
  title: "把证据放回正文",
  alternativeTitles: ["状态需要被看见"],
  bodyMarkdown: "## 先看到结果\n\n真正可复现的流程，会把证据留在本地。\n\n> 先审查，再发布。\n\n```ts\nstate.commit();\n```",
  assetPlacements: [{
    id: "P01",
    anchor: "把证据留在本地",
    assetUsageId: "usage-article",
    editorialPurpose: "Show the inspected local product result.",
  }],
  primaryCallToAction: "查看完整流程。",
  assetPlan: {
    sourceAssets: [{
      id: "source-demo",
      purpose: "Show the product interface.",
      evidenceRole: "product evidence",
    productionIntent: "Reuse the inspected screen capture.",
    captureProtocol: { captureMode: "existing", continuousPath: null, requiredVisibleStates: ["inspected result"], editingHandles: null, backupStrategy: "Use the immutable inspected capture as the source." },
      constraints: ["Use only the accepted product build."],
      preferredRoute: "accepted",
      reusableFragments: [],
      usageIds: ["usage-article"],
      essentialOneOffReason: "The article needs one decisive proof frame.",
    }],
    usages: [{
      id: "usage-article",
      carrier: "article",
      targetId: "P01",
      purpose: "Show the result.",
      sourceAssetId: "source-demo",
      fragmentId: null,
    }],
    uniqueAcquisitionCount: 1,
    plannedUsageCount: 1,
    oneOffAssetIds: ["source-demo"],
  },
};

test("assembles a manifest-backed local article preview from locked article inputs", () => {
  const output = buildArticleAssemblerOutput({
    master,
    masterArtifactId: "artifact_master_1",
    platformProfile: profile,
    branch,
    acceptedAssets: [{
      assetUsageId: "usage-article",
      assetId: "artifact_asset_ui_1",
      route: "accepted",
      sourceArtifactIds: ["artifact_capture_1"],
    }],
    documentId: "document_wechat_2",
    documentRevision: 2,
    createdAt: "2026-09-01T00:00:01.000Z",
  });

  assert.deepEqual(output.reference, {
    branchId: "branch_wechat_1",
    revision: 2,
    parentMasterRevision: "artifact_master_1",
    platform: "wechat",
    platformProfileId: "wechat-article",
    platformProfileVersion: "2026-09-01",
  });
  assert.deepEqual(output.document.blocks.map((block) => [block.id, block.type]), [
    ["title", "heading"], ["body_1", "heading"], ["body_2", "paragraph"], ["asset_P01", "image"], ["body_3", "quote"], ["body_4", "code"], ["primary_cta", "cta"],
  ]);
  assert.deepEqual(output.assetManifest.items, [{
    assetId: "artifact_asset_ui_1",
    route: "accepted",
    sourceArtifactIds: ["artifact_capture_1"],
    evidenceRole: "product evidence",
    constraints: ["Use only the accepted product build."],
  }]);
  assert.match(output.preview.html, /data-platform="wechat"/);
  assert.match(output.preview.html, /data-asset-id="artifact_asset_ui_1"/);
});

test("rejects a mismatched master branch and incomplete accepted material", () => {
  assert.throws(() => buildArticleAssemblerOutput({
    master,
    masterArtifactId: "different-master",
    platformProfile: profile,
    branch,
    acceptedAssets: [],
    documentId: "document_wechat_2",
    documentRevision: 2,
    createdAt: "2026-09-01T00:00:01.000Z",
  }), /parentMasterRevision/);

  assert.throws(() => buildArticleAssemblerOutput({
    master,
    masterArtifactId: "artifact_master_1",
    platformProfile: profile,
    branch,
    acceptedAssets: [{ assetUsageId: "usage-article", assetId: "asset", route: "accepted", sourceArtifactIds: [] }],
    documentId: "document_wechat_2",
    documentRevision: 2,
    createdAt: "2026-09-01T00:00:01.000Z",
  }), /at least one source artifact/);
});

test("keeps the platform profile check inside the shared production primitive", () => {
  assert.throws(() => buildArticleAssemblerOutput({
    master,
    masterArtifactId: "artifact_master_1",
    platformProfile: { ...profile, version: "different" },
    branch,
    acceptedAssets: [{ assetUsageId: "usage-article", assetId: "asset", route: "accepted", sourceArtifactIds: ["capture"] }],
    documentId: "document_wechat_2",
    documentRevision: 2,
    createdAt: "2026-09-01T00:00:01.000Z",
  }), /does not match/);

  assert.equal(createArticleAssemblerReference(branch, 2).branchId, "branch_wechat_1");
});
