#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "workflow";
const options = parseOptions(process.argv.slice(3));

if (options.help || !["workflow", "cut-workbench"].includes(mode)) {
  printHelp();
  process.exitCode = options.help ? 0 : 1;
} else {
  try {
    const result = mode === "workflow" ? setupWorkflow(options) : setupCutWorkbench(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Promo Workflow setup failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

function setupWorkflow(options) {
  const configPath = resolve(options["config-path"] ?? localConfigPath());
  const config = readConfig(configPath);
  const rootDirectory = resolve(options["repo-root"] ?? repoRoot);
  const nodePath = options.node ?? process.execPath;
  assertVersion(nodePath, 20, "Node.js");
  if (!existsSync(join(rootDirectory, "packages", "promo-mcp", "dist", "index.js"))) {
    throw new Error("Build Promo Workflow first with npm run build, then run npm run setup again.");
  }
  writeConfig(configPath, {
    ...config,
    schemaVersion: 1,
    workflow: { rootDirectory, nodePath, configuredAt: new Date().toISOString() },
  });
  return { status: "ready", configPath, workflow: { rootDirectory, nodePath }, next: "Install or restart the promo-video-article-workflow plugin." };
}

function setupCutWorkbench(options) {
  const configPath = resolve(options["config-path"] ?? localConfigPath());
  const config = readConfig(configPath);
  const dataHome = localDataHome();
  const sourceDirectory = resolve(options["source-dir"] ?? join(dataHome, "promo-workflow", "CutWorkBench"));
  const runtimeDirectory = resolve(options["runtime-dir"] ?? join(dataHome, "promo-workflow", "cut-workbench-runtime"));
  const repository = options.repo ?? "git@github.com:isagoakira/CutWorkBench.git";
  const branch = options.branch ?? "master";
  if (!existsSync(sourceDirectory)) {
    run("git", ["clone", "--branch", branch, "--single-branch", repository, sourceDirectory], "Clone Cut Workbench");
  }
  if (!existsSync(join(sourceDirectory, "src", "cut_workbench", "cli.py"))) {
    throw new Error(`${sourceDirectory} is not a Cut Workbench source checkout. Use --source-dir to provide one.`);
  }
  const pythonPath = options.python ?? findPython();
  assertVersion(pythonPath, 11, "Python");
  mkdirSync(runtimeDirectory, { recursive: true });
  const runtimeConfigPath = options["runtime-config"] ? resolve(options["runtime-config"]) : undefined;
  writeConfig(configPath, {
    ...config,
    schemaVersion: 1,
    cutWorkbench: {
      sourceDirectory,
      runtimeDirectory,
      pythonPath,
      ...(runtimeConfigPath ? { runtimeConfigPath } : {}),
      repository,
      branch,
      configuredAt: new Date().toISOString(),
    },
  });
  const environment = { ...process.env, PYTHONPATH: join(sourceDirectory, "src") };
  const args = ["-m", "cut_workbench.cli", "--root", runtimeDirectory, ...(runtimeConfigPath ? ["--config", runtimeConfigPath] : []), "list-tools"];
  run(pythonPath, args, "Verify Cut Workbench", environment, true);
  return {
    status: "ready",
    configPath,
    cutWorkbench: { sourceDirectory, runtimeDirectory, pythonPath },
    next: "Install or restart the promo-cut-workbench-adapter plugin, then use promo_get to confirm adapterStatus.cut_workbench.available is true.",
  };
}

function parseOptions(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--help" || value === "-h") { options.help = true; continue; }
    if (!value?.startsWith("--")) throw new Error(`Unknown argument: ${value}`);
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`${value} requires a value.`);
    options[key] = next;
    index += 1;
  }
  return options;
}

function readConfig(configPath) {
  if (!existsSync(configPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error(`Local configuration is not valid JSON: ${configPath}`);
  }
}

function writeConfig(configPath, config) {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function findPython() {
  for (const candidate of ["python3.13", "python3.12", "python3.11", "python3"]) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
    if (result.status === 0) return candidate;
  }
  throw new Error("Python 3.11+ was not found. Install it or pass --python /path/to/python.");
}

function assertVersion(command, minimum, label) {
  const code = label === "Node.js" ? "process.stdout.write(process.versions.node)" : "import sys; print('.'.join(map(str, sys.version_info[:2])))";
  const args = label === "Node.js" ? ["-e", code] : ["-c", code];
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${label} executable cannot run: ${command}`);
  const parts = result.stdout.trim().split(".").map((part) => Number.parseInt(part, 10));
  const major = parts[0];
  const minor = parts[1] ?? 0;
  const supported = label === "Python"
    ? Number.isInteger(major) && (major > 3 || (major === 3 && minor >= minimum))
    : Number.isInteger(major) && major >= minimum;
  if (!supported) throw new Error(`${label} ${label === "Python" ? `3.${minimum}` : minimum}+ is required; found ${result.stdout.trim() || "unknown"}.`);
}

function run(command, args, label, environment = process.env, quiet = false) {
  const result = spawnSync(command, args, { encoding: "utf8", env: environment });
  if (result.status !== 0) throw new Error(`${label} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  if (!quiet && result.stdout) process.stderr.write(result.stdout);
}

function localConfigPath() {
  const base = process.env.XDG_CONFIG_HOME
    ?? (platform() === "win32" ? process.env.APPDATA : undefined)
    ?? (platform() === "darwin" ? join(homedir(), "Library", "Application Support") : undefined)
    ?? join(homedir(), ".config");
  return join(base, "promo-workflow", "local.json");
}

function localDataHome() {
  if (platform() === "win32") return process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support");
  return process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
}

function printHelp() {
  process.stdout.write(`Usage:\n  npm run setup\n  npm run setup:cut-workbench -- [--source-dir PATH] [--runtime-dir PATH] [--python PATH]\n\nThe Cut Workbench setup clones the configured repository only when --source-dir does not exist.\n`);
}
