import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ArtifactRecord, ArtifactRef, WriteArtifactInput } from "./types.js";

const MAX_ARTIFACT_BYTES = 2_000_000;
const ARTIFACT_ID = /^artifact_[0-9a-f-]{36}$/;

export class ArtifactStore {
  constructor(private readonly directory: string) {}

  async write(input: WriteArtifactInput): Promise<ArtifactRef> {
    const serializedContent = JSON.stringify(input.content);
    if (serializedContent === undefined) {
      throw new Error("Artifact content must be JSON serializable.");
    }
    if (Buffer.byteLength(serializedContent, "utf8") > MAX_ARTIFACT_BYTES) {
      throw new Error(`Artifact exceeds the ${MAX_ARTIFACT_BYTES} byte limit.`);
    }

    const now = new Date().toISOString();
    const record: ArtifactRecord = {
      schemaVersion: 1,
      artifactId: `artifact_${randomUUID()}`,
      kind: input.kind,
      mediaType: input.mediaType ?? "application/json",
      contentHash: hash(serializedContent),
      revision: input.revision ?? 1,
      createdAt: now,
      parentArtifactIds: [...new Set(input.parentArtifactIds ?? [])],
      content: input.content,
    };
    await mkdir(this.directory, { recursive: true });
    const path = this.pathFor(record.artifactId);
    const temporaryPath = `${path}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await rename(temporaryPath, path);
    return toRef(record);
  }

  async read(artifactId: string): Promise<ArtifactRecord> {
    assertArtifactId(artifactId);
    let source: string;
    try {
      source = await readFile(this.pathFor(artifactId), "utf8");
    } catch (error) {
      throw new Error(`Cannot read artifact ${artifactId}: ${messageOf(error)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      throw new Error(`Artifact ${artifactId} is not valid JSON.`);
    }
    if (!isArtifactRecord(parsed) || parsed.artifactId !== artifactId) {
      throw new Error(`Artifact ${artifactId} has an invalid shape.`);
    }
    const serializedContent = JSON.stringify(parsed.content);
    if (serializedContent === undefined || hash(serializedContent) !== parsed.contentHash) {
      throw new Error(`Artifact ${artifactId} failed its integrity check.`);
    }
    return parsed;
  }

  private pathFor(artifactId: string): string {
    return join(this.directory, `${artifactId}.json`);
  }
}

function toRef(record: ArtifactRecord): ArtifactRef {
  const { content: _content, schemaVersion: _schemaVersion, ...reference } = record;
  return reference;
}

function isArtifactRecord(value: unknown): value is ArtifactRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<ArtifactRecord>;
  return candidate.schemaVersion === 1
    && typeof candidate.artifactId === "string"
    && typeof candidate.kind === "string"
    && typeof candidate.mediaType === "string"
    && typeof candidate.contentHash === "string"
    && typeof candidate.revision === "number"
    && typeof candidate.createdAt === "string"
    && Array.isArray(candidate.parentArtifactIds);
}

function assertArtifactId(artifactId: string): void {
  if (!ARTIFACT_ID.test(artifactId)) throw new Error("Invalid artifact ID.");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
