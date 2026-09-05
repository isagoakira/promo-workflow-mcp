import { createHash } from "node:crypto";
import type { MasterReview } from "@promo-workflow/contracts";

/** Shared canonical hash for requirements, submitted text and audit receipts. */
export function contentHash(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, canonical(x)])) : v;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function readAudit(value: unknown): NonNullable<MasterReview["audit"]> | undefined {
  if (value === undefined) return undefined;
  const obj = object(value);
  if (!Array.isArray(obj.findings)) throw new Error("audit.findings must be an array.");
  const findings = obj.findings.map(item => {
    const f = object(item);
    if (!["macro", "meso", "micro"].includes(String(f.layer)) || !["critical", "normal"].includes(String(f.severity)) || typeof f.verified !== "boolean") throw new Error("Invalid audit finding layer, severity or verified flag.");
    return { id: text(f.id), location: text(f.location), layer: f.layer as "macro" | "meso" | "micro", severity: f.severity as "critical" | "normal", evidence: text(f.evidence), action: text(f.action), preserve: text(f.preserve), acceptance: text(f.acceptance), verified: f.verified, verification: f.verified ? text(f.verification) : typeof f.verification === "string" ? f.verification : "" };
  });
  if (new Set(findings.map(f => f.id)).size !== findings.length) throw new Error("Audit finding IDs must be unique.");
  return { masterHash: text(obj.masterHash), requirementsHash: text(obj.requirementsHash), rationale: text(obj.rationale), findings };
}

export function validateEditorialAudit(review: MasterReview, master: unknown, requirements: unknown): void {
  const audit = review.audit;
  if (audit && (audit.masterHash !== contentHash(master) || audit.requirementsHash !== contentHash(requirements))) throw new Error("Audit evidence belongs to another master or requirements version.");
  if (!review.passed) return; // Failed/unverified drafts remain reviewable.
  if (!audit) throw new Error("An audit with current hashes and rationale is required to declare passed; submit passed=false to save an unverified draft.");
  if (review.evidenceBlockers.length || !review.writingStyle.passed || review.articleEditorial?.passed === false || review.storyboardDirection?.passed === false || audit.findings.some(f => f.severity === "critical" && !f.verified)) throw new Error("Audit passed contradicts unresolved critical findings or failed component reviews.");
}

function object(v: unknown): Record<string, unknown> { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Audit must be an object."); return v as Record<string, unknown>; }
function text(v: unknown): string { if (typeof v !== "string" || !v.trim()) throw new Error("Audit evidence fields require non-empty text."); return v; }
