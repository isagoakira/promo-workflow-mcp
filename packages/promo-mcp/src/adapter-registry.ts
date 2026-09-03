import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { configuredCutWorkbench } from "@promo-workflow/service";

export type ProductionAdapterCapability = "cut_workbench" | "vectcut";

export interface ProductionAdapterDescriptor {
  schemaVersion: 1;
  id: string;
  capability: ProductionAdapterCapability;
  displayName: string;
  requiredEnv: readonly string[];
  optionalEnv: readonly string[];
  remediation: string;
}

export interface ProductionAdapterStatus {
  id: string;
  capability: ProductionAdapterCapability;
  displayName: string;
  installed: boolean;
  configured: boolean;
  available: boolean;
  mode: "plugin" | "manual" | "unavailable";
  configurationSource: "environment" | "local_config" | "missing";
  missingEnvironment: readonly string[];
  remediation: string;
}

export interface DiscoverAdapterStatusOptions {
  environment?: NodeJS.ProcessEnv;
  adapterDirs?: readonly string[];
  codexHome?: string;
}

const KNOWN_ADAPTERS: readonly ProductionAdapterDescriptor[] = [
  {
    schemaVersion: 1,
    id: "cut-workbench",
    capability: "cut_workbench",
    displayName: "Cut Workbench",
    requiredEnv: ["PROMO_CUT_WORKBENCH_ROOT", "PROMO_CUT_WORKBENCH_SOURCE_DIR"],
    optionalEnv: ["PROMO_CUT_WORKBENCH_CONFIG", "PROMO_CUT_WORKBENCH_PYTHON"],
    remediation: "Install the Cut Workbench adapter and configure its root and source directory.",
  },
  {
    schemaVersion: 1,
    id: "vectcut",
    capability: "vectcut",
    displayName: "VectCut",
    requiredEnv: ["PROMO_VECTCUT_BASE_URL"],
    optionalEnv: [],
    remediation: "Install the VectCut adapter, start its local HTTP service, and configure PROMO_VECTCUT_BASE_URL.",
  },
];

/**
 * Reports adapter capability without loading arbitrary plugin code. Adapters
 * declare a small JSON contract; the MCP keeps ownership of process startup,
 * network calls, state transitions, and capability-gap behavior.
 */
export function discoverAdapterStatus(options: DiscoverAdapterStatusOptions = {}): readonly ProductionAdapterStatus[] {
  const environment = options.environment ?? process.env;
  const descriptors = installedDescriptors(environment, options);

  return KNOWN_ADAPTERS.map((fallback) => {
    const descriptor = descriptors.get(fallback.capability);
    const requiredEnv = descriptor?.requiredEnv ?? fallback.requiredEnv;
    const savedCutWorkbench = fallback.capability === "cut_workbench" ? configuredCutWorkbench(environment) : undefined;
    const configuredFromEnvironment = requiredEnv.every((key) => nonEmpty(environment[key]));
    const configured = fallback.capability === "cut_workbench"
      ? Boolean(savedCutWorkbench)
      : configuredFromEnvironment;
    const missingEnvironment = configured ? [] : requiredEnv.filter((key) => !nonEmpty(environment[key]));
    const installed = Boolean(descriptor);
    const configurationSource = configured
      ? configuredFromEnvironment ? "environment" : "local_config"
      : "missing";

    return {
      id: descriptor?.id ?? fallback.id,
      capability: fallback.capability,
      displayName: descriptor?.displayName ?? fallback.displayName,
      installed,
      configured,
      available: configured,
      mode: installed ? "plugin" : configured ? "manual" : "unavailable",
      configurationSource,
      missingEnvironment,
      remediation: descriptor?.remediation ?? fallback.remediation,
    };
  });
}

function installedDescriptors(
  environment: NodeJS.ProcessEnv,
  options: DiscoverAdapterStatusOptions,
): Map<ProductionAdapterCapability, ProductionAdapterDescriptor> {
  const descriptors = new Map<ProductionAdapterCapability, ProductionAdapterDescriptor>();
  const explicitDirs = options.adapterDirs ?? splitDirectories(environment.PROMO_WORKFLOW_ADAPTER_DIRS);
  for (const directory of explicitDirs) addDescriptor(descriptors, descriptorFileFor(directory));

  const codexHome = options.codexHome ?? environment.CODEX_HOME ?? join(homedir(), ".codex");
  const enabledPlugins = enabledCodexPlugins(join(codexHome, "config.toml"));
  for (const pluginKey of enabledPlugins) {
    const [plugin, marketplace] = pluginKey.split("@", 2);
    if (plugin !== "promo-cut-workbench-adapter" && plugin !== "promo-vectcut-adapter") continue;
    if (!marketplace) continue;
    addDescriptor(descriptors, newestDescriptor(join(codexHome, "plugins", "cache", marketplace, plugin)));
  }

  return descriptors;
}

function splitDirectories(value: string | undefined): readonly string[] {
  return value ? value.split(delimiter).map((item) => item.trim()).filter(Boolean) : [];
}

function descriptorFileFor(directory: string): string {
  return directory.endsWith(".json") ? directory : join(directory, "promo-workflow.adapter.json");
}

function newestDescriptor(pluginCacheDirectory: string): string | null {
  if (!existsSync(pluginCacheDirectory)) return null;
  const candidates = readdirSync(pluginCacheDirectory)
    .map((version) => join(pluginCacheDirectory, version, "promo-workflow.adapter.json"))
    .filter(existsSync)
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  return candidates[0] ?? null;
}

function enabledCodexPlugins(configPath: string): readonly string[] {
  if (!existsSync(configPath)) return [];
  const config = readFileSync(configPath, "utf8");
  const matches = [...config.matchAll(/^\[plugins\."([^"]+)"\]\s*\n\s*enabled\s*=\s*true\s*$/gm)];
  return matches.map((match) => match[1]).filter((plugin): plugin is string => Boolean(plugin));
}

function addDescriptor(
  descriptors: Map<ProductionAdapterCapability, ProductionAdapterDescriptor>,
  path: string | null,
): void {
  if (!path || !existsSync(path)) return;
  try {
    const descriptor = parseDescriptor(JSON.parse(readFileSync(path, "utf8")));
    if (!descriptors.has(descriptor.capability)) descriptors.set(descriptor.capability, descriptor);
  } catch {
    // A malformed optional plugin is unavailable; it must not stop the core MCP.
  }
}

function parseDescriptor(value: unknown): ProductionAdapterDescriptor {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error("Unsupported adapter descriptor.");
  if (value.capability !== "cut_workbench" && value.capability !== "vectcut") throw new Error("Unknown adapter capability.");
  return {
    schemaVersion: 1,
    id: text(value.id, "id"),
    capability: value.capability,
    displayName: text(value.displayName, "displayName"),
    requiredEnv: textArray(value.requiredEnv, "requiredEnv"),
    optionalEnv: textArray(value.optionalEnv, "optionalEnv"),
    remediation: text(value.remediation, "remediation"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Adapter descriptor ${label} is required.`);
  return value.trim();
}

function textArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`Adapter descriptor ${label} must be a string array.`);
  }
  return value.map((item) => item.trim());
}

function nonEmpty(value: string | undefined): boolean {
  return Boolean(value?.trim());
}
