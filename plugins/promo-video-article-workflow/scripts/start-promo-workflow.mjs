#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const saved = readLocalConfig();
const repoRoot = text(process.env.PROMO_WORKFLOW_ROOT) ?? text(saved?.workflow?.rootDirectory);
const nodePath = text(process.env.PROMO_WORKFLOW_NODE) ?? text(saved?.workflow?.nodePath) ?? process.execPath;
const entrypoint = repoRoot ? join(repoRoot, "packages", "promo-mcp", "dist", "index.js") : undefined;

if (!repoRoot || !entrypoint || !existsSync(entrypoint)) {
  fail("Promo Workflow is not configured. In a built Promo Workflow checkout, run `npm run setup`, then restart this plugin.");
}

const child = spawn(nodePath, [entrypoint], { env: process.env, stdio: "inherit" });
child.on("error", (error) => fail(`Could not start Promo Workflow: ${error.message}`));
child.on("exit", (code) => { process.exitCode = code ?? 1; });

function readLocalConfig() {
  const configPath = text(process.env.PROMO_WORKFLOW_CONFIG_PATH) ?? join(
    text(process.env.XDG_CONFIG_HOME)
      ?? (platform() === "win32" ? text(process.env.APPDATA) : undefined)
      ?? (platform() === "darwin" ? join(homedir(), "Library", "Application Support") : undefined)
      ?? join(homedir(), ".config"),
    "promo-workflow",
    "local.json",
  );
  if (!existsSync(configPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return parsed?.schemaVersion === 1 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function fail(message) {
  process.stderr.write(`promo-workflow: ${message}\n`);
  process.exitCode = 1;
  process.exit();
}
