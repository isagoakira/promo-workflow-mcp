import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { discoverAdapterStatus } from "../dist/adapter-registry.js";

test("reports installed adapter configuration separately from environment fallback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "promo-adapter-"));
  await writeFile(join(directory, "promo-workflow.adapter.json"), JSON.stringify({
    schemaVersion: 1,
    id: "vectcut",
    capability: "vectcut",
    displayName: "VectCut",
    requiredEnv: ["PROMO_VECTCUT_BASE_URL"],
    optionalEnv: [],
    remediation: "Configure VectCut.",
  }));

  const unconfigured = discoverAdapterStatus({ environment: {}, adapterDirs: [directory] });
  const vectCut = unconfigured.find((adapter) => adapter.capability === "vectcut");
  assert.equal(vectCut?.installed, true);
  assert.equal(vectCut?.configured, false);
  assert.deepEqual(vectCut?.missingEnvironment, ["PROMO_VECTCUT_BASE_URL"]);

  const configured = discoverAdapterStatus({
    environment: { PROMO_VECTCUT_BASE_URL: "http://127.0.0.1:9001" },
    adapterDirs: [directory],
  });
  const configuredVectCut = configured.find((adapter) => adapter.capability === "vectcut");
  assert.equal(configuredVectCut?.installed, true);
  assert.equal(configuredVectCut?.available, true);
  assert.equal(configuredVectCut?.mode, "plugin");
});
