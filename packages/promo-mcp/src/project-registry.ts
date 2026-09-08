import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { JsonWorkflowStore } from '@promo-workflow/service';

type RecordValue = Record<string, any>;
export interface RegisteredProject { projectId: string; rootDirectory: string; dataDirectory: string; registeredAt: string }
export interface ProjectCheck extends RegisteredProject { status: 'ready' | 'attention' | 'unavailable'; issues: string[]; workflows: RecordValue[] }
const object = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
const rootOf = (record: RecordValue) => record.rootDirectory ?? record.context?.rootDirectory;
export function defaultRegistryPath() { return resolve(process.env.PROMO_PROJECT_REGISTRY ?? join(homedir(), '.promo-workflow', 'projects.json')); }

/** Stores locations only. Scanning never advances a workflow or rewrites its data. */
export class ProjectRegistry {
  constructor(readonly filePath: string, readonly localDataDirectory: string) {}

  async entries(): Promise<RegisteredProject[]> {
    let value: unknown;
    try { value = JSON.parse(await readFile(this.filePath, 'utf8')); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw new Error('工程名册无法读取，请检查登记文件。'); }
    if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.projects) || !value.projects.every((p: unknown) => object(p) && typeof p.projectId === 'string' && typeof p.rootDirectory === 'string' && isAbsolute(p.rootDirectory) && typeof p.dataDirectory === 'string' && isAbsolute(p.dataDirectory))) throw new Error('工程名册格式不正确；没有覆盖原文件。');
    return value.projects;
  }

  async register(rootDirectory: string, dataDirectory?: string): Promise<RegisteredProject> {
    if (!isAbsolute(rootDirectory) || (dataDirectory && !isAbsolute(dataDirectory))) throw new Error('请提供工作区和数据目录的绝对路径。');
    const root = await realpath(rootDirectory);
    if (!(await stat(root)).isDirectory()) throw new Error('工作区必须是目录。');
    const candidates = dataDirectory ? [dataDirectory] : [join(root, '.promo-workflow', 'data'), join(root, 'data'), root, this.localDataDirectory];
    const matches = new Set<string>();
    for (const candidate of candidates) {
      try {
        const source = await realpath(candidate);
        const records = await this.records(source);
        if ((await Promise.all(records.map(async r => this.matchesRoot(r, root)))).some(Boolean)) matches.add(source);
      } catch (e) { if (dataDirectory) throw e; }
    }
    if (matches.size !== 1) throw new Error(matches.size ? '发现多个流程数据目录，请明确指定 dataDirectory。' : '没有找到属于这个工作区的流程记录。请指定原来的数据目录；不会从素材文件猜测进度。');
    const source = [...matches][0]!;
    const entry = { projectId: createHash('sha256').update(root).digest('hex').slice(0, 20), rootDirectory: root, dataDirectory: source, registeredAt: new Date().toISOString() };
    return new JsonWorkflowStore(this.filePath).exclusive(async () => {
      const projects = await this.entries();
      const prior = projects.find(p => p.rootDirectory === root);
      if (prior) {
        if (prior.dataDirectory !== source) throw new Error('该工作区已登记到另一数据目录，请先核对工程是否迁移，不能静默替换。');
        return prior;
      }
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify({ schemaVersion: 1, projects: [...projects, entry] }, null, 2), { mode: 0o600 });
      await rename(temporary, this.filePath);
      return entry;
    });
  }

  async records(dataDirectory: string): Promise<RecordValue[]> {
    const parsed: unknown = JSON.parse(await readFile(join(dataDirectory, 'workflows.json'), 'utf8'));
    if (!object(parsed) || parsed.schemaVersion !== 1 || !object(parsed.workflows)) throw new Error('流程状态文件格式不正确。');
    return Object.entries(parsed.workflows).map(([id, value]) => {
      if (!object(value) || value.id !== id || !/^[A-Za-z0-9_-]+$/.test(id) || typeof value.state !== 'string' || !Number.isInteger(value.revision) || !['video', 'article'].includes(value.carrier)) throw new Error('流程记录缺少有效的编号、状态或版本。');
      return value;
    });
  }

  private async matchesRoot(record: RecordValue, root: string): Promise<boolean> {
    const value = rootOf(record);
    if (typeof value !== 'string' || !isAbsolute(value)) return false;
    return (await realpath(value).catch(() => resolve(value))) === root;
  }

  /** Bootstrap known workspaces from the active store; no recursive directory discovery. */
  async discoverCurrent(): Promise<string[]> {
    const issues: string[] = [];
    let records: RecordValue[];
    try { records = await this.records(this.localDataDirectory); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return issues; return [`当前流程目录无法读取：${(e as Error).message}`]; }
    for (const root of new Set(records.map(rootOf).filter((p): p is string => typeof p === 'string' && isAbsolute(p)))) {
      try { await this.register(root, this.localDataDirectory); }
      catch (e) { issues.push(`${root}：${(e as Error).message}`); }
    }
    return issues;
  }

  async scan(): Promise<{ checkedAt: string; projects: ProjectCheck[] }> {
    const projects: ProjectCheck[] = [];
    for (const entry of await this.entries()) {
      const check: ProjectCheck = { ...entry, status: 'ready', issues: [], workflows: [] };
      try {
        if (!(await stat(entry.rootDirectory)).isDirectory()) throw new Error('工作区目录不可用。');
        const records = await this.records(entry.dataDirectory);
        for (const record of records) {
          if (!await this.matchesRoot(record, entry.rootDirectory)) continue;
          const missing: string[] = [];
          for (const ref of record.context?.artifactRefs ?? []) {
            if (typeof ref?.artifactId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(ref.artifactId)) { missing.push('无效交付物引用'); continue; }
            try { await access(join(entry.dataDirectory, 'artifacts', `${ref.artifactId}.json`)); }
            catch { missing.push(ref.artifactId); }
          }
          if (missing.length) check.issues.push(`${record.displayName ?? record.id}：${missing.length} 项交付物记录缺失。`);
          check.workflows.push({ workflowId: record.id, carrier: record.carrier, displayName: record.displayName ?? '未命名流程', state: record.state, revision: record.revision, summary: record.summary ?? '', updatedAt: record.updatedAt ?? null, production: record.videoProduction ? { phase: record.videoProduction.phase, round: record.videoProduction.round, status: record.videoProduction.status } : null });
        }
        if (!check.workflows.length) check.issues.push('原数据目录里没有找到这个工作区的流程。');
        if (check.issues.length) check.status = 'attention';
      } catch (e) { check.status = 'unavailable'; check.issues.push(`无法检查工程：${(e as Error).message}`); }
      projects.push(check);
    }
    const owners = new Map<string, Set<string>>();
    for (const p of projects) for (const w of p.workflows) { const sources = owners.get(w.workflowId) ?? new Set(); sources.add(p.dataDirectory); owners.set(w.workflowId, sources); }
    for (const p of projects) if (p.workflows.some(w => owners.get(w.workflowId)!.size > 1)) { p.status = 'attention'; p.issues.push('流程编号在多个数据目录中重复，已阻止跨工程读取和修改，请先核对副本。'); }
    return { checkedAt: new Date().toISOString(), projects };
  }

  async locations(): Promise<Map<string, string[]>> {
    const entries = await this.entries();
    const local = await realpath(this.localDataDirectory).catch(() => resolve(this.localDataDirectory));
    const sources = new Set([local, ...entries.map(p => p.dataDirectory)]);
    const result = new Map<string, string[]>();
    for (const source of sources) {
      let records: RecordValue[];
      try { records = await this.records(source); }
      catch { continue; }
      for (const record of records) {
        if (source !== local && !(await Promise.all(entries.filter(p => p.dataDirectory === source).map(p => this.matchesRoot(record, p.rootDirectory)))).some(Boolean)) continue;
        const locations = result.get(record.id) ?? []; locations.push(source); result.set(record.id, locations);
      }
    }
    return result;
  }

  async locate(workflowId: string): Promise<string> {
    const locations = (await this.locations()).get(workflowId) ?? [];
    if (locations.length !== 1) throw new Error(locations.length ? '流程编号存在多个副本，无法安全确定工程。' : '未找到已登记的工程流程，请先登记原工作区。');
    return locations[0]!;
  }
}
