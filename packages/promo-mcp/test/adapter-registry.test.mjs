import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
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

test("uses the durable local configuration for an installed Cut Workbench adapter", async () => {
  const directory = await mkdtemp(join(tmpdir(), "promo-cut-adapter-"));
  const configHome = await mkdtemp(join(tmpdir(), "promo-cut-config-"));
  await writeFile(join(directory, "promo-workflow.adapter.json"), JSON.stringify({
    schemaVersion: 1,
    id: "cut-workbench",
    capability: "cut_workbench",
    displayName: "Cut Workbench",
    requiredEnv: ["PROMO_CUT_WORKBENCH_ROOT", "PROMO_CUT_WORKBENCH_SOURCE_DIR"],
    optionalEnv: [],
    remediation: "Configure Cut Workbench.",
  }));
  await mkdir(join(configHome, "promo-workflow"));
  await writeFile(join(configHome, "promo-workflow", "local.json"), JSON.stringify({
    schemaVersion: 1,
    cutWorkbench: { sourceDirectory: "/workbench/source", runtimeDirectory: "/workbench/runtime" },
  }));

  const adapters = discoverAdapterStatus({ environment: { XDG_CONFIG_HOME: configHome }, adapterDirs: [directory] });
  const cutWorkbench = adapters.find((adapter) => adapter.capability === "cut_workbench");
  assert.equal(cutWorkbench?.available, true);
  assert.equal(cutWorkbench?.configurationSource, "local_config");
  assert.deepEqual(cutWorkbench?.missingEnvironment, []);
});
