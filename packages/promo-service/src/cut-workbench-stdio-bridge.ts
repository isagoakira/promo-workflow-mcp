import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { configuredCutWorkbench } from "./cut-workbench-config.js";
import { createPreproductionMaterialPlan, createSpokenScript } from "./video-preproduction-deliverables.js";

import type {
  CutWorkbenchBridge,
  CutWorkbenchBridgeInput,
  CutWorkbenchProductionResult,
} from "./cut-workbench-bridge.js";

export interface CutWorkbenchStdioBridgeOptions {
  command: string;
  args: readonly string[];
  cwd?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
}

interface JsonRpcResponse {
  id?: number;
  result?: {
    structuredContent?: unknown;
    isError?: boolean;
    content?: readonly { type?: string; text?: string }[];
  };
  error?: { message?: string };
}

interface WorkbenchProject {
  project_id: string;
  revision: number;
  status: string;
  execution?: {
    production_context?: CutWorkbenchBridgeInput['productionControl'];
    handoff: { plan_version: string; assets: unknown[] };
    current_preview_id: string | null;
    previews: Record<string, { preview_id: string; artifact_id?: string; locator: string; sha256: string; duration_ms: number; source_revision: number; plan_version: string }>;
    deliverables: Record<string, { kind: string; preview_id: string }>;
    annotations: Record<string, { status: string; fixes?: { preview_id: string; evidence: string[] }[] }>;
  } | null;
  production_workflow?: {
    stages?: Record<string, { status?: string; artifact_ids?: string[] }>;
    artifacts?: Record<string, { stage_id?: string; kind?: string }>;
  } | null;
}

interface VerificationReport {
  passed: boolean;
  issues: readonly { message?: string; code?: string }[];
}

/**
 * A local-only bridge to Cut Workbench's public stdio MCP surface.  Promo
 * starts this command only while reconciling its production node; the normal
 * Agent-facing Workbench MCP remains a separate process and owns every edit,
 * review, artifact, and delivery decision.
 */
export class CutWorkbenchStdioBridge implements CutWorkbenchBridge {
  constructor(private readonly options: CutWorkbenchStdioBridgeOptions) {}

  static fromEnvironment(environment: NodeJS.ProcessEnv = process.env): CutWorkbenchStdioBridge | undefined {
    const configured = configuredCutWorkbench(environment);
    if (!configured) return undefined;

    const root = configured.runtimeDirectory;
    const sourceDir = configured.sourceDirectory;
    const config = configured.runtimeConfigPath;
    const python = configured.pythonPath ?? "python";
    const inheritedPythonPath = environment.PYTHONPATH;
    const pythonPath = inheritedPythonPath ? `src${pathSeparator()}${inheritedPythonPath}` : "src";
    return new CutWorkbenchStdioBridge({
      command: python,
      args: ["-m", "cut_workbench.cli", "--root", root, ...(config ? ["--config", config] : []), "mcp"],
      cwd: sourceDir,
      env: { ...environment, PYTHONPATH: pythonPath },
    });
  }

  async run(input: CutWorkbenchBridgeInput): Promise<CutWorkbenchProductionResult> {
    const client = new StdioMcpClient(this.options);
    try {
      await client.initialize();
      const handoff = {
        plan_id: `promo:${input.lockedMaster.topicId}`,
        plan_version: createHash("sha256").update(JSON.stringify({ master: input.lockedMaster, requirements: input.requirementSet })).digest("hex"),
        storyboard: input.lockedMaster.master,
        narration: createSpokenScript(input.lockedMaster.master),
        recording_guide: createPreproductionMaterialPlan(input.lockedMaster.master, input.requirementSet),
        acceptance_criteria: input.lockedMaster.master.shots.map(shot => ({ criterion_id: `shot:${shot.id}`, text: `${shot.shotPurpose} / ${shot.visualAction}` })),
        assets: input.mediaAssets ?? [],
      };
      // A changed production plan owns a fresh execution project. Older evidence stays historical.
      const projectId = projectIdFor(`${input.lockedMaster.topicId}:${handoff.plan_version}`);
      let project = await this.inspectOrCreate(client, projectId, input);
      if (!project.execution || project.execution.handoff.plan_version !== handoff.plan_version) {
        project = await client.call<WorkbenchProject>("project.apply_plan", {
          project_id: projectId,
          expected_revision: project.revision,
          actor: "promo-workflow",
          reason: "Receive Promo-owned production plan in the single execution node; preserve legacy workflow as history only.",
          operations: [{ op: "configure_execution", handoff }],
          evidence: [
            `promo:topic:${input.lockedMaster.topicId}`,
            `promo:master-confirmed:${input.lockedMaster.confirmedAt}`,
          ],
        });
      }
      if (JSON.stringify(project.execution?.handoff.assets) !== JSON.stringify(handoff.assets)) {
        project = await client.call<WorkbenchProject>("project.apply_plan", { project_id: projectId, expected_revision: project.revision, actor: "promo-workflow", reason: "Synchronize material inputs without restarting production.", operations: [{ op: "update_execution_assets", assets: handoff.assets }], evidence: [`promo:topic:${input.lockedMaster.topicId}`] });
      }

      // Import precise user anchors, never reinterpret old seconds on a new preview.
      if (input.productionControl && JSON.stringify(project.execution?.production_context) !== JSON.stringify(input.productionControl)) {
        project = await client.call<WorkbenchProject>('project.apply_plan', { project_id: projectId, expected_revision: project.revision, actor: 'promo-workflow', reason: 'Synchronize current Promo phase and round without resetting execution.', operations: [{ op: 'update_execution_context', context: input.productionControl }], evidence: ['promo:production-round'] });
      }
      for (const annotation of input.videoAnnotations ?? []) {
        const sourcePreviewId = localPreviewId(projectId, annotation.previewId);
        if (!sourcePreviewId || !project.execution?.previews[sourcePreviewId]) continue;
        if (!project.execution.annotations[annotation.id]) {
          project = await client.call<WorkbenchProject>("project.apply_plan", {
            project_id: projectId, expected_revision: project.revision, actor: "promo-workflow", reason: "Forward version-bound user review feedback.",
            operations: [{ op: "add_review_annotation", annotation_id: annotation.id, preview_id: sourcePreviewId,
              selections: annotation.selections.map(s => ({ start_ms: s.startMs, end_ms: s.endMs, ...(s.region ? { region: s.region } : {}) })),
              text: annotation.text, route: annotation.intent === "planning_change" ? "promo" : "cutbench" }], evidence: [`promo:annotation:${annotation.id}:${annotation.revision}`],
          });
        }
        const remote = project.execution?.annotations[annotation.id];
        let operation: Record<string, unknown> | undefined;
        if (annotation.status === "resolved" && remote?.status === "awaiting_review") operation = { op: "resolve_review_annotation", annotation_id: annotation.id, preview_id: localPreviewId(projectId, annotation.targetPreviewId ?? ""), reviewer: "promo-workbench-human-review", human_confirmed: true, evidence: [`promo:human-annotation:${annotation.id}:${annotation.revision}`] };
        else if (annotation.status === "open" && annotation.revision > 1 && (remote?.status === "resolved" || remote?.status === "awaiting_review")) operation = { op: "reopen_review_annotation", annotation_id: annotation.id, reason: "Human reopened the annotation in Promo review." };
        if (operation) project = await client.call<WorkbenchProject>("project.apply_plan", { project_id: projectId, expected_revision: project.revision, actor: "promo-workflow", reason: "Synchronize explicit human annotation decision.", operations: [operation], evidence: [`promo:annotation:${annotation.id}:${annotation.revision}`] });
      }

      const verification = await client.call<VerificationReport>("project.verify", { project_id: projectId, revision: project.revision });
      const executionStatus = await client.call<{ delivery_ready: boolean; blockers: readonly string[] }>("execution.status", { project_id: projectId });
      return toBridgeResult(project, input, verification, executionStatus);
    } finally {
      await client.close();
    }
  }

  private async inspectOrCreate(
    client: StdioMcpClient,
    projectId: string,
    input: CutWorkbenchBridgeInput,
  ): Promise<WorkbenchProject> {
    try {
      return await client.call<WorkbenchProject>("project.inspect", { project_id: projectId });
    } catch (error) {
      if (!(error instanceof WorkbenchToolError) || !/project not found/i.test(error.message)) throw error;
      return client.call<WorkbenchProject>("project.create", {
        project_id: projectId,
        title: input.lockedMaster.master.workingTitle,
        canvas: { width: 1920, height: 1080, fps: 30 },
        editor_adapter: "unassigned",
      });
    }
  }
}

class WorkbenchToolError extends Error {}

class StdioMcpClient {
  private readonly child;
  private nextId = 1;
  private buffer = "";
  private readonly pending = new Map<number, { resolve: (response: JsonRpcResponse) => void; reject: (error: Error) => void }>();
  private readonly stderr: string[] = [];

  constructor(options: CutWorkbenchStdioBridgeOptions) {
    this.child = spawn(options.command, [...options.args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk: string) => this.stderr.push(chunk));
    this.child.on("error", (error) => this.failAll(error));
    this.child.on("exit", () => this.failAll(new Error(this.describeExit())));
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "promo-workflow", version: "0.1.0" },
    });
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);
  }

  async call<T>(name: string, arguments_: Record<string, unknown>): Promise<T> {
    const response = await this.request("tools/call", { name, arguments: arguments_ });
    const result = response.result;
    if (!result) throw new WorkbenchToolError("Cut Workbench returned no tool result.");
    if (result.isError) {
      const text = result.content?.map((item) => item.text ?? "").join("\n") || "Cut Workbench rejected the tool call.";
      throw new WorkbenchToolError(text);
    }
    return result.structuredContent as T;
  }

  async close(): Promise<void> {
    if (!this.child.killed) this.child.kill();
    await Promise.race([once(this.child, "exit").catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 250))]);
  }

  private request(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) {
        try {
          const response = JSON.parse(line) as JsonRpcResponse;
          if (typeof response.id === "number") {
            const pending = this.pending.get(response.id);
            if (pending) {
              this.pending.delete(response.id);
              if (response.error) pending.reject(new Error(response.error.message ?? "Cut Workbench JSON-RPC error."));
              else pending.resolve(response);
            }
          }
        } catch (error) {
          this.failAll(error instanceof Error ? error : new Error(String(error)));
        }
      }
      newline = this.buffer.indexOf("\n");
    }
  }

  private failAll(error: Error): void {
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }

  private describeExit(): string {
    const stderr = this.stderr.join("").trim();
    return stderr ? `Cut Workbench process exited: ${stderr}` : "Cut Workbench process exited before responding.";
  }
}

function toBridgeResult(
  project: WorkbenchProject,
  input: CutWorkbenchBridgeInput,
  verification: VerificationReport,
  executionStatus: { delivery_ready: boolean; blockers: readonly string[] },
): CutWorkbenchProductionResult {
  const execution = project.execution;
  const previews = Object.entries(execution?.previews ?? {}).map(([id, p]) => ({ previewId: publicPreviewId(project.project_id, id), artifactId: p.artifact_id ?? workbenchArtifactId(project.project_id, id), locator: p.locator, sha256: p.sha256, durationMs: p.duration_ms, sourceRevision: p.source_revision, planVersion: p.plan_version }));
  const current = previews.find(p => p.previewId === publicPreviewId(project.project_id, execution?.current_preview_id ?? ""));
  const outputs = current ? [current.artifactId] : [];
  // Subtitle delivery is a separate artifact; legacy stage approval never authorizes v2 output.
  const subtitle = Object.entries(execution?.deliverables ?? {}).find(([, a]) => a.kind === "subtitle" && a.preview_id === execution?.current_preview_id);
  const delivered = project.status === "delivered" || project.status === "handed_off";
  const materialBlockers = input.materialBlockers ?? (input.acceptedProductionResults.length && !input.mediaAssets?.length ? ["Accepted materials have no resolved local locators; supply a verified material manifest."] : []);
  const passed = executionStatus.delivery_ready && delivered && verification.passed && outputs.length > 0 && Boolean(subtitle) && materialBlockers.length === 0;
  const blockers = passed ? [] : [...materialBlockers, ...executionStatus.blockers, ...verification.issues.map(i => i.message ?? i.code ?? "Video verification failed"), ...(!delivered ? ["Deliver the verified current execution preview before locking."] : []), ...(!subtitle ? ["A final subtitle artifact is required."] : [])];

  return {
    kind: "production_result",
    protocolId: "cut-production-v2",
    previews,
    currentPreviewId: current?.previewId ?? null,
    annotationUpdates: Object.entries(execution?.annotations ?? {}).map(([id, a]) => ({ id, status: a.status === "awaiting_review" ? "addressed" : a.status, ...(a.fixes?.at(-1) ? { targetPreviewId: publicPreviewId(project.project_id, a.fixes.at(-1)!.preview_id) } : {}), reply: a.fixes?.at(-1)?.evidence.join("\n") || "Cutbench 已生成修改版，请人工复核。" })),
    projectId: project.project_id,
    revision: project.revision,
    unitStatuses: input.acceptedProductionResults.map((result) => ({ unitId: result.unitId, status: "accepted" })),
    verifiedOutputArtifactIds: outputs,
    finalSubtitleArtifactId: subtitle ? workbenchArtifactId(project.project_id, subtitle[0]) : null,
    finalGate: { passed, blockers, verifiedAt: passed ? new Date().toISOString() : null },
  };
}

function projectIdFor(topicId: string): string {
  return `promo_${createHash("sha256").update(topicId).digest("hex").slice(0, 24)}`;
}

function publicPreviewId(projectId: string, previewId: string): string { return `${projectId}__${Buffer.from(previewId).toString("base64url")}`; }
function localPreviewId(projectId: string, previewId: string): string | null {
  return previewId.startsWith(`${projectId}__`) ? Buffer.from(previewId.slice(projectId.length + 2), "base64url").toString("utf8") : null;
}

function workbenchArtifactId(projectId: string, artifactId: string): string {
  return `cwb:${projectId}:${artifactId}`;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function pathSeparator(): string {
  return process.platform === "win32" ? ";" : ":";
}
