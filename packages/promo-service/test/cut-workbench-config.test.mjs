import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { configuredCutWorkbench, localPromoConfigPath, readCutWorkbenchLocalConfig } from "../dist/index.js";

test("loads the durable user-level Cut Workbench configuration and lets environment values override it", async () => {
  const configHome = await mkdtemp(join(tmpdir(), "promo-config-"));
  const configPath = localPromoConfigPath({ XDG_CONFIG_HOME: configHome });
  await mkdir(join(configHome, "promo-workflow"));
  await writeFile(configPath, JSON.stringify({
    schemaVersion: 1,
    cutWorkbench: {
      sourceDirectory: "/workbench/source",
      runtimeDirectory: "/workbench/runtime",
      pythonPath: "/usr/local/bin/python3.11",
    },
  }));

  assert.deepEqual(readCutWorkbenchLocalConfig({ XDG_CONFIG_HOME: configHome }), {
    sourceDirectory: "/workbench/source",
    runtimeDirectory: "/workbench/runtime",
    pythonPath: "/usr/local/bin/python3.11",
  });
  assert.deepEqual(configuredCutWorkbench({ XDG_CONFIG_HOME: configHome, PROMO_CUT_WORKBENCH_ROOT: "/temporary/runtime" }), {
    sourceDirectory: "/workbench/source",
    runtimeDirectory: "/temporary/runtime",
    pythonPath: "/usr/local/bin/python3.11",
  });
});
