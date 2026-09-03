#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const saved = readLocalConfig();
const sourceDirectory = text(process.env.PROMO_CUT_WORKBENCH_SOURCE_DIR) ?? text(saved?.sourceDirectory);
const runtimeDirectory = text(process.env.PROMO_CUT_WORKBENCH_ROOT) ?? text(saved?.runtimeDirectory);
const pythonPath = text(process.env.PROMO_CUT_WORKBENCH_PYTHON) ?? text(saved?.pythonPath) ?? "python";
const runtimeConfigPath = text(process.env.PROMO_CUT_WORKBENCH_CONFIG) ?? text(saved?.runtimeConfigPath);

if (!sourceDirectory || !runtimeDirectory) {
  fail("Cut Workbench is not configured. Run `npm run setup:cut-workbench` in the Promo Workflow repository, then restart this plugin.");
}
if (!existsSync(sourceDirectory)) fail(`Cut Workbench source directory does not exist: ${sourceDirectory}`);

const pythonPathEntry = join(sourceDirectory, "src");
const environment = { ...process.env, PYTHONPATH: process.env.PYTHONPATH ? `${pythonPathEntry}${platform() === "win32" ? ";" : ":"}${process.env.PYTHONPATH}` : pythonPathEntry };
const args = ["-m", "cut_workbench.cli", "--root", runtimeDirectory, ...(runtimeConfigPath ? ["--config", runtimeConfigPath] : []), "mcp"];
const child = spawn(pythonPath, args, { cwd: sourceDirectory, env: environment, stdio: "inherit" });
child.on("error", (error) => fail(`Could not start Cut Workbench: ${error.message}`));
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
    return parsed?.schemaVersion === 1 && parsed.cutWorkbench && typeof parsed.cutWorkbench === "object" ? parsed.cutWorkbench : undefined;
  } catch {
    return undefined;
  }
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function fail(message) {
  process.stderr.write(`Cut Workbench adapter: ${message}\n`);
  process.exitCode = 1;
  process.exit();
}
