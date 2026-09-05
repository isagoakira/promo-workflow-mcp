import { mkdir, readFile, rename, writeFile, rmdir } from "node:fs/promises";
import { dirname } from "node:path";

import type { WorkflowStoreData } from "./types.js";

const EMPTY_STORE: WorkflowStoreData = {
  schemaVersion: 1,
  workflows: {},
};

export class JsonWorkflowStore {
  constructor(private readonly filePath: string) {}

  /** Serialize read-modify-write across MCP and review-host processes. Never steal a live lock. */
  async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const lock = `${this.filePath}.lock`;
    const deadline = Date.now() + 10000;
    for (;;) {
      try { await mkdir(lock); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (Date.now() >= deadline) throw new Error(`Workflow store busy (${lock}); retry, or inspect an abandoned lock after a crashed writer.`);
        await new Promise(resolve => setTimeout(resolve, 40));
      }
    }
    try { return await operation(); } finally { await rmdir(lock); }
  }

  async read(): Promise<WorkflowStoreData> {
    try {
      const source = await readFile(this.filePath, "utf8");
      const parsed: unknown = JSON.parse(source);
      if (!isStore(parsed)) {
        throw new Error("invalid workflow store shape");
      }
      return parsed;
    } catch (error: unknown) {
      if (isMissingFile(error)) {
        return structuredClone(EMPTY_STORE);
      }
      throw new Error(`Cannot read workflow store: ${messageOf(error)}`);
    }
  }

  async write(data: WorkflowStoreData): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.filePath);
  }
}

function isStore(value: unknown): value is WorkflowStoreData {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<WorkflowStoreData>;
  return candidate.schemaVersion === 1 && typeof candidate.workflows === "object";
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
