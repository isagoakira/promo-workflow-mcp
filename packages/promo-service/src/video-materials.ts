import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { ArtifactStore } from "./artifacts/store.js";
import type { ProductionUnitAcceptanceResult } from "./production-results.js";

export interface VideoMaterial {
  unitId: string; artifactId: string; artifactContentHash: string; locator: string; sha256: string; provenance: string;
}
/** Only documented locator keys in material containers are interpreted as files. Prose is never a path. */
export async function resolveVideoMaterials(results: readonly ProductionUnitAcceptanceResult[], store: ArtifactStore): Promise<{ assets: VideoMaterial[]; blockers: string[] }> {
  const assets: VideoMaterial[] = [], blockers: string[] = [];
  for (const result of results) for (const reference of result.acceptedArtifactRefs) {
    const label = `${result.unitId}/${reference.artifactId}`;
    try {
      const artifact = await store.read(reference.artifactId);
      if (artifact.contentHash !== reference.contentHash) throw new Error("accepted artifact version differs from stored artifact");
      const entries = materialEntries(artifact.content);
      if (!entries.length) throw new Error("missing explicit local locator; supply a material manifest with locator, localPath or filePath");
      for (const entry of entries) {
        if (!isAbsolute(entry.locator)) throw new Error("material locator must be an absolute local path");
        if (!(await stat(entry.locator)).isFile()) throw new Error("material locator is not a regular file");
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(entry.locator)) hash.update(chunk);
        const sha256 = hash.digest("hex");
        if (entry.sha256 !== undefined && entry.sha256 !== sha256) throw new Error("material file SHA-256 differs from its manifest");
        assets.push({ unitId: result.unitId, artifactId: reference.artifactId, artifactContentHash: artifact.contentHash, locator: entry.locator, sha256, provenance: result.provenanceNote });
      }
    } catch (error) { blockers.push(`Material ${label}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return { assets, blockers };
}
function materialEntries(value: unknown, depth = 0): { locator: string; sha256?: string }[] {
  if (!value || typeof value !== "object" || depth > 8) return [];
  if (Array.isArray(value)) return value.flatMap(v => materialEntries(v, depth + 1));
  const record = value as Record<string, unknown>;
  const locator = [record.locator, record.localPath, record.filePath].find(v => typeof v === "string" && v.length);
  const own = typeof locator === "string" ? [{ locator, ...(typeof record.sha256 === "string" ? { sha256: record.sha256 } : {}) }] : [];
  return [...own, ...["assets", "files", "entries", "mediaSources", "outputs", "media", "manifest"].flatMap(key => materialEntries(record[key], depth + 1))];
}
