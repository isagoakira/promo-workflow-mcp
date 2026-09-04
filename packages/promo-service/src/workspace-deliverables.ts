import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { ArtifactStore } from "./artifacts/store.js";
import type { ArtifactKind, ArtifactRef } from "./artifacts/types.js";
import {
  USER_WORKSPACE_DIRECTORIES,
  WORKFLOW_WORKSPACE_DIRECTORIES,
  createWorkspaceScope,
  isWorkspaceScope,
  type WorkspaceScope,
} from "./workspace-scope.js";

export interface WorkspaceDeliverableRef {
  artifactId: string;
  kind: ArtifactKind;
  path: string;
  versionPath: string;
}

export interface SyncWorkflowWorkspaceInput {
  workflowId: string;
  carrier: "video" | "article";
  displayName?: string | undefined;
  rootDirectory?: string | undefined;
  state: string;
  revision: number;
  summary: string;
  artifactRefs: readonly ArtifactRef[];
  workspaceScope?: WorkspaceScope | undefined;
}

/**
 * Projects immutable internal artifacts into stable, human-readable workspace
 * paths. Agents can load the current file by name; the version file preserves
 * the exact revision that produced it.
 */
export class WorkspaceDeliverables {
  constructor(private readonly directory: string, private readonly artifacts: ArtifactStore) {}

  /** Returns the stable root for a legacy workflow that predates the gate. */
  scopeFor(workflowId: string, carrier: "video" | "article"): WorkspaceScope {
    return createWorkspaceScope({
      workflowId,
      carrier,
      root: resolve(join(this.directory, workflowId)),
      setupConfirmed: true,
      setupConfirmedAt: null,
    });
  }

  /** Creates the per-workflow directory contract before any content node runs. */
  async initialize(input: {
    workflowId: string;
    carrier: "video" | "article";
  }): Promise<WorkspaceScope> {
    const scope = createWorkspaceScope({
      workflowId: input.workflowId,
      carrier: input.carrier,
      root: resolve(join(this.directory, input.workflowId)),
    });
    await this.ensureLayout(scope);
    await this.writeGuide(scope);
    await atomicWrite(scope.scopePath, `${JSON.stringify(scope, null, 2)}\n`);
    await this.writeUserGuides(scope);
    return scope;
  }

  async sync(input: SyncWorkflowWorkspaceInput): Promise<WorkspaceDeliverableRef[]> {
    const root = resolve(join(this.directory, input.workflowId));
    const scope = input.workspaceScope && isWorkspaceScope(input.workspaceScope)
      ? input.workspaceScope
      : createWorkspaceScope({
        workflowId: input.workflowId,
        carrier: input.carrier,
        root,
        // Workflows created before the workspace gate are grandfathered in;
        // new workflows always pass their unconfirmed scope explicitly.
        setupConfirmed: true,
        setupConfirmedAt: new Date().toISOString(),
      });
    if (scope.workflowId !== input.workflowId || scope.carrier !== input.carrier || scope.root !== root) {
      throw new Error("Workspace scope does not match the active workflow.");
    }
    await this.ensureLayout(scope);
    await this.writeGuide(scope);
    await atomicWrite(scope.scopePath, `${JSON.stringify(scope, null, 2)}\n`);
    await this.writeUserGuides(scope);
    const byKind = new Map<ArtifactKind, ArtifactRef>();
    for (const artifact of input.artifactRefs) byKind.set(artifact.kind, artifact);

    const deliverables: WorkspaceDeliverableRef[] = [];
    for (const artifact of byKind.values()) {
      const placement = placementFor(artifact.kind);
      if (!placement) continue;
      const record = await this.artifacts.read(artifact.artifactId);
      const markdown = artifact.kind === "human_review_packet";
      const currentPath = markdown
        ? join(root, "00-control", "current-review.md")
        : join(root, placement.node, `${placement.name}.json`);
      const versionPath = markdown
        ? join(root, "00-control", "reviews", `pre-production-r${input.revision}.${artifact.artifactId}.md`)
        : join(root, placement.node, `${placement.name}.${artifact.artifactId}.json`);
      const body = markdown
        ? reviewMarkdown(record.content)
        : JSON.stringify({
          workflowId: input.workflowId,
          carrier: input.carrier,
          state: input.state,
          workflowRevision: input.revision,
          artifact,
          content: record.content,
        }, null, 2) + "\n";
      await atomicWrite(currentPath, body);
      await writeOnce(versionPath, body);
      deliverables.push({
        artifactId: artifact.artifactId,
        kind: artifact.kind,
        path: currentPath,
        versionPath,
      });
    }

    const manifest = {
      workflowId: input.workflowId,
      carrier: input.carrier,
      displayName: input.displayName ?? input.summary,
      rootDirectory: input.rootDirectory ?? null,
      state: input.state,
      revision: input.revision,
      summary: input.summary,
      deliverables,
    };
    await atomicWrite(join(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    return deliverables;
  }

  private async ensureLayout(scope: WorkspaceScope): Promise<void> {
    await mkdir(scope.root, { recursive: true });
    await Promise.all([
      ...WORKFLOW_WORKSPACE_DIRECTORIES.map(({ relativePath }) => mkdir(join(scope.root, relativePath), { recursive: true })),
      ...USER_WORKSPACE_DIRECTORIES.map(({ relativePath }) => mkdir(join(scope.root, relativePath), { recursive: true })),
    ]);
  }

  private async writeGuide(scope: WorkspaceScope): Promise<void> {
    const setupState = scope.setupConfirmed
      ? `已确认（${scope.setupConfirmedAt ?? "时间未记录"}）`
      : "待用户确认";
    const rows = WORKFLOW_WORKSPACE_DIRECTORIES
      .map(({ relativePath, purpose }) => `| \`${relativePath}/\` | Promo 工作流 | ${purpose} |`)
      .join("\n");
    const userRows = USER_WORKSPACE_DIRECTORIES
      .map(({ relativePath, purpose }) => `| \`${relativePath}/\` | 用户维护；Agent 只读 | ${purpose} |`)
      .join("\n");
    const body = [
      "# 本项目 Promo 工作区",
      "",
      `- 工作流：\`${scope.workflowId}\``,
      `- 载体：${scope.carrier === "article" ? "文章/推文" : "视频"}`,
      `- 工作区状态：${setupState}`,
      "",
      "## Agent 首次进入必须完成",
      "",
      "1. 先读完本 README，向用户说明下面的目录、资料入口和边界。",
      "2. 请用户确认：本次工作只使用这个工作区，用户资料放在 `10-user-materials/` 或 `11-references/`。",
      "3. 在收到明确确认前，不得调用 `promo_run`，也不得读取其他 workflow、父目录、项目 `sources/` 或未授权本地路径。",
      "4. 确认后才从原定的 7 个内容节点继续；这一步是前置门禁，不算第 8 个节点。",
      "",
      "## 目录结构",
      "",
      "| 目录 | 维护者 | 用途 |",
      "| --- | --- | --- |",
      rows,
      userRows,
      "",
      "## 所有权和资料管理",
      "",
      "- `00-control/` 到 `07-release/` 是 Promo 生成和维护的流程制品区。Agent 不直接改写已有制品或控制文件，必须通过 `promo_workflow` 提交。",
      "- `10-user-materials/` 是用户放置本项目可阅读资料的入口：现有稿件、截图、录屏、脱敏附件和进度包都放这里。",
      "- `11-references/` 放用户明确授权给本项目使用的参考资料。",
      "- 用户资料默认只读；如果资料包含密钥、个人路径或其他敏感信息，请先脱敏。",
      "",
      "## 越界规则",
      "",
      `- 当前项目根目录只有：\`${scope.root}\`。相邻 workflow、父目录、项目级 \`sources/\` 和根目录之外的本地文件不属于本项目。`,
      "- 本地资料必须通过当前工作区的路径引用；远程资料使用可追溯 URL。越界的本地路径会被拒绝。",
      "- 每个 Agent 的工作摘要都带有同一份边界约束；发现资料串入其他项目时，应停止引用并报告缺口。",
      "",
      "## 当前入口",
      "",
      `- 人工审核摘要：\`${join(scope.root, "00-control", "current-review.md")}\`（生成后出现）`,
      `- 用户资料入口：\`${scope.userMaterialsPath}\``,
      `- 参考资料入口：\`${scope.referencesPath}\``,
      `- 机器边界记录：\`${scope.scopePath}\``,
      "",
    ].join("\n");
    await atomicWrite(scope.guidePath, body);
  }

  private async writeUserGuides(scope: WorkspaceScope): Promise<void> {
    await writeOnce(join(scope.userMaterialsPath, "README.md"), [
      "# 用户项目资料",
      "",
      "请把本项目希望 Agent 阅读的稿件、截图、录屏、脱敏附件或进度包放在这里。",
      "资料默认只读；不要放入密钥、密码、个人路径或与本项目无关的其他工作流文件。",
      "",
    ].join("\n"));
    await writeOnce(join(scope.referencesPath, "README.md"), [
      "# 用户授权参考资料",
      "",
      "请只放入明确授权给本项目使用的外部参考资料，并尽量保留来源和版本信息。",
      "",
    ].join("\n"));
  }
}

function placementFor(kind: ArtifactKind): { node: string; name: string } | null {
  switch (kind) {
    case "fetched_topic_cards": return { node: "01-selection", name: "fetched-topic-cards" };
    case "topic_match": return { node: "01-selection", name: "topic-matching" };
    case "selected_topic": return { node: "01-selection", name: "selected-topic" };
    case "baseline_draft": return { node: "02-campaign-intent", name: "campaign-intent-draft" };
    case "baseline": return { node: "02-campaign-intent", name: "campaign-intent" };
    case "decision_ledger": return { node: "00-control", name: "decision-ledger" };
    case "human_review_packet": return { node: "00-control", name: "current-review" };
    case "competition_report": return { node: "00-control", name: "competition-report" };
    case "creative_routes": return { node: "03-creative-outline", name: "creative-routes" };
    case "creative_route_selection": return { node: "03-creative-outline", name: "selected-route" };
    case "creative_outline_draft": return { node: "03-creative-outline", name: "outline-draft" };
    case "creative_outline": return { node: "03-creative-outline", name: "locked-outline" };
    case "outline_script": return { node: "03-creative-outline", name: "outline-script" };
    case "content_master_draft": return { node: "04-master", name: "master-draft" };
    case "master_review": return { node: "04-master", name: "master-review" };
    case "content_master": return { node: "04-master", name: "locked-master" };
    case "spoken_script": return { node: "04-master", name: "spoken-script" };
    case "recording_execution": return { node: "04-master", name: "recording-execution" };
    case "requirement_set": return { node: "05-requirements", name: "material-requirements" };
    case "preproduction_material_plan": return { node: "05-requirements", name: "preproduction-material-plan" };
    case "production_plan": return { node: "06-production", name: "production-plan" };
    case "production_checkpoint": return { node: "06-production", name: "production-checkpoint" };
    case "production_handoff": return { node: "06-production", name: "backend-handoff" };
    case "production_locked": return { node: "06-production", name: "production-result" };
    case "workspace_progress_audit": return { node: "00-control", name: "workspace-progress-audit" };
    case "article_document": return { node: "06-production", name: "article-document" };
    case "preview": return { node: "06-production", name: "preview" };
    case "asset_manifest": return { node: "06-production", name: "asset-manifest" };
    case "vectcut_draft": return { node: "06-production", name: "vectcut-draft" };
    case "release_package_draft": return { node: "07-release", name: "release-draft" };
    case "release_package": return { node: "07-release", name: "release-package" };
    case "asset_plan":
    case "subtitle":
      return null;
  }
}

function reviewMarkdown(content: unknown): string {
  if (typeof content === "object" && content !== null && typeof (content as { markdown?: unknown }).markdown === "string") {
    return (content as { markdown: string }).markdown;
  }
  throw new Error("Human review packet must contain rendered markdown.");
}

async function atomicWrite(path: string, body: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, body, "utf8");
  await rename(temporaryPath, path);
}

async function writeOnce(path: string, body: string): Promise<void> {
  try {
    await readFile(path, "utf8");
  } catch {
    await atomicWrite(path, body);
  }
}
