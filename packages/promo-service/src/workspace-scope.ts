import { isAbsolute, join, relative, resolve, sep } from "node:path";

import type { WorkflowCarrier } from "./types.js";

export const WORKFLOW_WORKSPACE_DIRECTORIES = [
  { relativePath: "00-control", owner: "promo", purpose: "流程状态、审核包、决策与版本控制。" },
  { relativePath: "01-selection", owner: "promo", purpose: "选材、来源与匹配结果。" },
  { relativePath: "02-campaign-intent", owner: "promo", purpose: "宣传意图、读者对象与表达边界。" },
  { relativePath: "03-creative-outline", owner: "promo", purpose: "创意路线与锁定大纲。" },
  { relativePath: "04-master", owner: "promo", purpose: "文章主稿、分镜与审校记录。" },
  { relativePath: "05-requirements", owner: "promo", purpose: "素材需求、证据计划与前期执行包。" },
  { relativePath: "06-production", owner: "promo", purpose: "制作单元、预览与验收结果。" },
  { relativePath: "07-release", owner: "promo", purpose: "标题、封面、简介与发布包。" },
] as const;

export const USER_WORKSPACE_DIRECTORIES = [
  { relativePath: "10-user-materials", purpose: "用户放置可阅读的项目资料、截图、录屏和脱敏素材。" },
  { relativePath: "11-references", purpose: "用户明确授权给本项目使用的参考资料。" },
] as const;

export type WorkspacePathMode = "read" | "write";

export interface WorkspaceScope {
  schemaVersion: 1;
  workflowId: string;
  carrier: WorkflowCarrier;
  root: string;
  guidePath: string;
  scopePath: string;
  userMaterialsPath: string;
  referencesPath: string;
  allowedReadRoots: readonly string[];
  allowedWriteRoots: readonly string[];
  userManagedRoots: readonly string[];
  setupConfirmed: boolean;
  setupConfirmedAt: string | null;
}

export function createWorkspaceScope(input: {
  workflowId: string;
  carrier: WorkflowCarrier;
  root: string;
  setupConfirmed?: boolean;
  setupConfirmedAt?: string | null;
}): WorkspaceScope {
  const root = resolve(input.root);
  const promoRoots = WORKFLOW_WORKSPACE_DIRECTORIES.map(({ relativePath }) => join(root, relativePath));
  const userRoots = USER_WORKSPACE_DIRECTORIES.map(({ relativePath }) => join(root, relativePath));
  return {
    schemaVersion: 1,
    workflowId: input.workflowId,
    carrier: input.carrier,
    root,
    guidePath: join(root, "README.md"),
    scopePath: join(root, "00-control", "workspace-scope.json"),
    userMaterialsPath: join(root, "10-user-materials"),
    referencesPath: join(root, "11-references"),
    allowedReadRoots: [root, ...promoRoots, ...userRoots],
    allowedWriteRoots: promoRoots,
    userManagedRoots: userRoots,
    setupConfirmed: input.setupConfirmed ?? false,
    setupConfirmedAt: input.setupConfirmedAt ?? null,
  };
}

export function isWorkspaceScope(value: unknown): value is WorkspaceScope {
  if (typeof value !== "object" || value === null) return false;
  const scope = value as Partial<WorkspaceScope>;
  return scope.schemaVersion === 1
    && typeof scope.workflowId === "string"
    && (scope.carrier === "article" || scope.carrier === "video")
    && typeof scope.root === "string"
    && typeof scope.guidePath === "string"
    && typeof scope.scopePath === "string"
    && typeof scope.userMaterialsPath === "string"
    && typeof scope.referencesPath === "string"
    && Array.isArray(scope.allowedReadRoots)
    && scope.allowedReadRoots.every((path) => typeof path === "string")
    && Array.isArray(scope.allowedWriteRoots)
    && scope.allowedWriteRoots.every((path) => typeof path === "string")
    && Array.isArray(scope.userManagedRoots)
    && scope.userManagedRoots.every((path) => typeof path === "string")
    && typeof scope.setupConfirmed === "boolean"
    && (scope.setupConfirmedAt === null || typeof scope.setupConfirmedAt === "string");
}

export function confirmWorkspaceScope(scope: WorkspaceScope, confirmedAt: string): WorkspaceScope {
  return { ...scope, setupConfirmed: true, setupConfirmedAt: confirmedAt };
}

/**
 * Validates a path supplied by an Agent or user against the current workflow's
 * explicit boundary. URLs are intentionally handled by the caller because
 * they are sources, not local filesystem references.
 */
export function assertWorkspacePath(
  scope: WorkspaceScope,
  candidate: string,
  mode: WorkspacePathMode,
  label = "workspace path",
): string {
  const raw = candidate.trim();
  if (!raw) throw new Error(`${label} must be non-empty.`);
  if (raw.startsWith("~")) {
    throw workspaceBoundaryError(label, raw, scope);
  }
  const target = isAbsolute(raw) ? resolve(raw) : resolve(scope.root, raw);
  const roots = mode === "write" ? scope.allowedWriteRoots : scope.allowedReadRoots;
  if (!roots.some((root) => isWithin(resolve(root), target))) {
    throw workspaceBoundaryError(label, raw, scope);
  }
  return target;
}

/**
 * Walks commit context and rejects local references that escape the active
 * workflow. HTTP(S) URLs remain valid source references and are not treated as
 * filesystem paths.
 */
export function validateWorkspaceReferences(value: unknown, scope: WorkspaceScope, label = "context"): void {
  walkWorkspaceReferences(value, [label], scope);
}

function walkWorkspaceReferences(value: unknown, keyPath: string[], scope: WorkspaceScope): void {
  if (typeof value === "string") {
    const key = keyPath.at(-1) ?? "value";
    if (isRemoteUrl(value)) return;
    if (looksLikeLocalPath(value, key)) {
      const mode: WorkspacePathMode = isWritePathKey(key) ? "write" : "read";
      assertWorkspacePath(scope, value, mode, keyPath.join("."));
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkWorkspaceReferences(item, [...keyPath, String(index)], scope));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    walkWorkspaceReferences(child, [...keyPath, key], scope);
  }
}

function looksLikeLocalPath(value: string, key: string): boolean {
  if (isAbsolute(value) || value.startsWith("../") || value.startsWith("./")) return true;
  if (value.includes("\\")) return true;
  const pathKey = /(path|file|directory|dir|root|material|reference)/i.test(key);
  if (!pathKey) return false;
  return value.includes("/") || /\.(md|markdown|json|txt|csv|tsv|png|jpe?g|gif|webp|mp4|mov|wav|mp3|srt|pdf|ya?ml)$/i.test(value);
}

function isWritePathKey(key: string): boolean {
  return /(workspace(file|path)?|output(path|file)?|target(path|file)?|write(path|file)?)/i.test(key);
}

function isRemoteUrl(value: string): boolean {
  return /^(https?|mcp):\/\//i.test(value.trim());
}

function isWithin(root: string, target: string): boolean {
  const child = relative(root, target);
  return child === "" || (child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

function workspaceBoundaryError(label: string, value: string, scope: WorkspaceScope): Error {
  return new Error(
    `Workspace boundary violation: ${label} points outside the active project workspace: ${value}. `
    + `Use ${scope.userMaterialsPath} or ${scope.referencesPath} for readable project material, `
    + "or provide a remote URL; sibling workflows and parent directories are not allowed.",
  );
}
