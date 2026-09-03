import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { configuredCutWorkbench } from "./cut-workbench-config.js";

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
      const projectId = projectIdFor(input.lockedMaster.topicId);
      let project = await this.inspectOrCreate(client, projectId, input);
      if (!project.production_workflow) {
        project = await client.call<WorkbenchProject>("project.apply_plan", {
          project_id: projectId,
          expected_revision: project.revision,
          actor: "promo-workflow",
          reason: "Initialize the canonical Cut Workbench production workflow from the locked Promo master.",
          operations: [{ op: "configure_production_workflow", protocol_id: "video-production-v1" }],
          evidence: [
            `promo:topic:${input.lockedMaster.topicId}`,
            `promo:master-confirmed:${input.lockedMaster.confirmedAt}`,
          ],
        });
      }

      const verification = await client.call<VerificationReport>("project.verify", { project_id: projectId, revision: project.revision });
      return toBridgeResult(project, input, verification);
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
): CutWorkbenchProductionResult {
  const workflow = project.production_workflow;
  const stage09 = workflow?.stages?.["09-final"];
  const artifacts = Object.entries(workflow?.artifacts ?? {});
  const outputs = artifacts
    .filter(([, artifact]) => artifact.stage_id === "09-final" && ["final-master", "release-landscape", "release-vertical"].includes(artifact.kind ?? ""))
    .map(([artifactId]) => workbenchArtifactId(project.project_id, artifactId));
  const subtitle = artifacts.find(([, artifact]) => artifact.stage_id === "09-final" && artifact.kind === "final-subtitle");
  const delivered = project.status === "delivered" || project.status === "handed_off";
  const passed = stage09?.status === "approved" && delivered && verification.passed && outputs.length > 0 && Boolean(subtitle);
  const blockers = passed ? [] : collectBlockers(project, stage09?.status, verification, outputs.length, Boolean(subtitle));

  return {
    kind: "production_result",
    projectId: project.project_id,
    revision: project.revision,
    unitStatuses: input.acceptedProductionResults.map((result) => ({ unitId: result.unitId, status: "accepted" })),
    verifiedOutputArtifactIds: outputs,
    finalSubtitleArtifactId: subtitle ? workbenchArtifactId(project.project_id, subtitle[0]) : null,
    finalGate: { passed, blockers, verifiedAt: passed ? new Date().toISOString() : null },
  };
}

function collectBlockers(
  project: WorkbenchProject,
  finalStageStatus: string | undefined,
  verification: VerificationReport,
  outputCount: number,
  hasSubtitle: boolean,
): string[] {
  const blockers: string[] = [];
  if (finalStageStatus !== "approved") blockers.push(`Cut Workbench stage 09-final is ${finalStageStatus ?? "not_started"}; approve it before final lock.`);
  if (project.status !== "delivered" && project.status !== "handed_off") blockers.push("Cut Workbench project must pass its delivered or handed_off protocol gate.");
  if (outputCount === 0) blockers.push("Cut Workbench has no verified final video output artifact.");
  if (!hasSubtitle) blockers.push("Cut Workbench has no final-subtitle artifact from stage 09-final.");
  for (const issue of verification.issues) blockers.push(issue.message ?? issue.code ?? "Cut Workbench verification did not pass.");
  return [...new Set(blockers)];
}

function projectIdFor(topicId: string): string {
  return `promo_${createHash("sha256").update(topicId).digest("hex").slice(0, 24)}`;
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
