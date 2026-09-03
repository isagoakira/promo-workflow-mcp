import { existsSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

export interface CutWorkbenchLocalConfig {
  sourceDirectory: string;
  runtimeDirectory: string;
  pythonPath?: string;
  runtimeConfigPath?: string;
}

interface PromoLocalConfig {
  schemaVersion?: unknown;
  cutWorkbench?: unknown;
}

export function localPromoConfigPath(environment: NodeJS.ProcessEnv = process.env): string {
  const explicit = nonEmpty(environment.PROMO_WORKFLOW_CONFIG_PATH);
  if (explicit) return explicit;
  const configHome = nonEmpty(environment.XDG_CONFIG_HOME)
    ?? (platform() === "win32" ? nonEmpty(environment.APPDATA) : undefined)
    ?? (platform() === "darwin" ? join(homedir(), "Library", "Application Support") : undefined)
    ?? join(homedir(), ".config");
  return join(configHome, "promo-workflow", "local.json");
}

/**
 * Loads only the narrow, user-managed local bridge configuration. Malformed or
 * absent configuration is intentionally equivalent to no optional bridge.
 */
export function readCutWorkbenchLocalConfig(environment: NodeJS.ProcessEnv = process.env): CutWorkbenchLocalConfig | undefined {
  const path = localPromoConfigPath(environment);
  if (!existsSync(path)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isRecord(parsed.cutWorkbench)) return undefined;
    const sourceDirectory = nonEmpty(parsed.cutWorkbench.sourceDirectory);
    const runtimeDirectory = nonEmpty(parsed.cutWorkbench.runtimeDirectory);
    const pythonPath = nonEmpty(parsed.cutWorkbench.pythonPath);
    const runtimeConfigPath = nonEmpty(parsed.cutWorkbench.runtimeConfigPath);
    if (!sourceDirectory || !runtimeDirectory) return undefined;
    return {
      sourceDirectory,
      runtimeDirectory,
      ...(pythonPath ? { pythonPath } : {}),
      ...(runtimeConfigPath ? { runtimeConfigPath } : {}),
    };
  } catch {
    return undefined;
  }
}

export function configuredCutWorkbench(environment: NodeJS.ProcessEnv = process.env): CutWorkbenchLocalConfig | undefined {
  const saved = readCutWorkbenchLocalConfig(environment);
  const sourceDirectory = nonEmpty(environment.PROMO_CUT_WORKBENCH_SOURCE_DIR) ?? saved?.sourceDirectory;
  const runtimeDirectory = nonEmpty(environment.PROMO_CUT_WORKBENCH_ROOT) ?? saved?.runtimeDirectory;
  if (!sourceDirectory || !runtimeDirectory) return undefined;
  const pythonPath = nonEmpty(environment.PROMO_CUT_WORKBENCH_PYTHON) ?? saved?.pythonPath;
  const runtimeConfigPath = nonEmpty(environment.PROMO_CUT_WORKBENCH_CONFIG) ?? saved?.runtimeConfigPath;
  return {
    sourceDirectory,
    runtimeDirectory,
    ...(pythonPath ? { pythonPath } : {}),
    ...(runtimeConfigPath ? { runtimeConfigPath } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
