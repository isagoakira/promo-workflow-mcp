import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { ArtifactStore } from "../dist/index.js";
import { resolveVideoMaterials } from "../dist/video-materials.js";
test("accepted material manifests resolve explicit files with real hashes and lineage", async () => {
  const root = await mkdtemp(join(tmpdir(), "promo-material-"));
  const store = new ArtifactStore(join(root, "artifacts"));
  const locator = join(root, "capture.mp4");
  await writeFile(locator, "fixture bytes");
  const artifact = await store.write({ kind: "asset_manifest", content: { files: [{ locator }] } });
  const result = await resolveVideoMaterials([{ unitId: "u1", acceptedArtifactRefs: [artifact], provenanceNote: "actual recording", backendRevision: 1 }], store);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.assets[0].sha256, createHash("sha256").update("fixture bytes").digest("hex"));
  assert.equal(result.assets[0].artifactId, artifact.artifactId);
  assert.equal(result.assets[0].locator, locator);
  assert.equal(result.assets[0].provenance, "actual recording");
});
test("prose paths, relative paths, missing files and wrong hashes produce explicit blockers", async () => {
  const root = await mkdtemp(join(tmpdir(), "promo-material-bad-"));
  const store = new ArtifactStore(join(root, "artifacts"));
  const locator = join(root, "capture.mp4");
  await writeFile(locator, "bytes");
  for (const content of [locator, { description: locator }, { locator: "relative.mp4" }, { locator: join(root, "missing.mp4") }, { locator, sha256: "a".repeat(64) }]) {
    const artifact = await store.write({ kind: "asset_manifest", content });
    const result = await resolveVideoMaterials([{ unitId: "u1", acceptedArtifactRefs: [artifact], provenanceNote: "source", backendRevision: 1 }], store);
    assert.equal(result.assets.length, 0);
    assert.equal(result.blockers.length, 1);
  }
});
