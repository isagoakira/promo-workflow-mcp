import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ArtifactStore } from "../dist/index.js";

test("artifacts are immutable, content-addressed records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "promo-artifacts-"));
  const store = new ArtifactStore(directory);
  const first = await store.write({
    kind: "baseline",
    content: { coreMessage: "One clear idea" },
  });
  const second = await store.write({
    kind: "creative_outline",
    content: { beats: ["hook", "proof"] },
    parentArtifactIds: [first.artifactId],
  });

  const restored = await store.read(second.artifactId);
  assert.equal(restored.parentArtifactIds[0], first.artifactId);
  assert.deepEqual(restored.content, { beats: ["hook", "proof"] });
  assert.match(restored.contentHash, /^[a-f0-9]{64}$/);
});
