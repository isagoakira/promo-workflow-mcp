import type { ContentMaster, MasterReview } from "@promo-workflow/contracts";
import { EDITORIAL_ISSUE_CODES, type EditorialIssueCode } from "./editorial-problem-guidance.js";

export const EDITORIAL_CHECK_IDS = ["paragraph_contribution", "adjacency_basis", "narrative_claims", "objection_targets", "reader_prerequisites"] as const;

const REPAIR_RESOURCE: Record<EditorialIssueCode, string> = {
  long_range_logic: "long-range-logic-repair",
  paragraph_transition: "paragraph-transition-repair",
  fabricated_feeling: "narrative-permission-repair",
  adversarial_wording: "sentence-naturalness-repair",
  density_rhythm: "paragraph-rhythm-repair",
  reader_gap: "reader-gap-repair",
};

export interface EditorialLoopBase {
  artifactId: string;
  master: ContentMaster;
}

export function validateEditorialLoop(review: Pick<MasterReview, "passed" | "editorialDiagnostic">, master: ContentMaster, base?: EditorialLoopBase): void {
  if (master.carrier !== "article") return;
  const loop = review.editorialDiagnostic;
  if (!loop) throw new Error("Article masterReview requires editorialDiagnostic from the fixed reading checks.");
  const judgmentCodes = unionCodes(loop.judgment.checks);
  assertSameCodes(loop.judgment.triggeredIssueCodes, judgmentCodes, "triggeredIssueCodes must match the judgment checks.");
  if (base) {
    if (loop.judgment.baseArtifactId !== base.artifactId) throw new Error("Editorial judgment must reference the previous master artifact.");
    assertCheckEvidence(loop.judgment.checks, articleBody(base.master), "previous master");
  } else if (loop.judgment.baseArtifactId !== null) {
    throw new Error("The first master has no previous artifact for editorial judgment.");
  } else {
    assertCheckEvidence(loop.judgment.checks, master.bodyMarkdown, "current master");
    if (loop.repairs.length > 0) throw new Error("The first stored draft cannot claim repairs against an unstored prior version.");
  }

  const repairs = new Map(loop.repairs.map((repair) => [repair.issueCode, repair]));
  if (repairs.size !== loop.repairs.length) throw new Error("Editorial repairs cannot repeat an issue code.");
  for (const repair of loop.repairs) {
    if (!loop.judgment.triggeredIssueCodes.includes(repair.issueCode)) throw new Error("Editorial repair refers to an issue that judgment did not trigger.");
    if (repair.guidanceResourceId !== REPAIR_RESOURCE[repair.issueCode]) throw new Error("Editorial repair must name the repair guidance loaded for its issue code.");
    nonEmptyStrings(repair.changedLocations, "changedLocations");
    if (base) assertQuotes(repair.beforeEvidence, articleBody(base.master), "previous master");
    assertQuotes(repair.afterEvidence, master.bodyMarkdown, "current master");
  }

  const unresolved = unionCodes(loop.recheck.checks);
  assertSameCodes(loop.recheck.unresolvedIssueCodes, unresolved, "unresolvedIssueCodes must match the recheck.");
  assertCheckEvidence(loop.recheck.checks, master.bodyMarkdown, "current master");
  if (review.passed) {
    if (loop.judgment.triggeredIssueCodes.some((code) => !repairs.has(code))) throw new Error("Editorial pass must repair every triggered issue.");
    if (loop.recheck.unresolvedIssueCodes.length > 0 || loop.recheck.checks.some((check) => check.status !== "clear")) throw new Error("Editorial pass cannot contain unresolved recheck findings.");
  }
}

function unionCodes(checks: NonNullable<MasterReview["editorialDiagnostic"]>["judgment"]["checks"]): EditorialIssueCode[] {
  assertChecks(checks);
  return [...new Set(checks.flatMap((check) => check.issueCodes))];
}

function assertChecks(checks: NonNullable<MasterReview["editorialDiagnostic"]>["judgment"]["checks"]): void {
  if (checks.length !== EDITORIAL_CHECK_IDS.length || new Set(checks.map((check) => check.id)).size !== EDITORIAL_CHECK_IDS.length || EDITORIAL_CHECK_IDS.some((id) => !checks.some((check) => check.id === id))) throw new Error("Editorial loop must contain every fixed reading check exactly once.");
  checks.forEach((check) => {
    if ((check.status === "issue" || check.status === "uncertain") && check.issueCodes.length === 0) throw new Error("Issue and uncertain checks must trigger repair guidance.");
    if (check.status === "clear" && check.issueCodes.length > 0) throw new Error("Clear checks cannot carry issue codes.");
  });
}

function assertCheckEvidence(checks: NonNullable<MasterReview["editorialDiagnostic"]>["judgment"]["checks"], body: string, label: string): void {
  checks.forEach((check) => {
    if (!check.evidence.trim()) throw new Error("Editorial check evidence cannot be empty.");
    assertQuotes(check.evidenceQuotes, body, label);
  });
}

function assertQuotes(quotes: readonly string[], body: string, label: string): void {
  nonEmptyStrings(quotes, "evidence quotes");
  if (quotes.some((quote) => !body.includes(quote))) throw new Error(`Editorial evidence quote does not occur in the ${label}.`);
}

function nonEmptyStrings(values: readonly string[], label: string): void {
  if (!values.length || values.some((value) => typeof value !== "string" || !value.trim())) throw new Error(`${label} requires non-empty strings.`);
}

function assertSameCodes(actual: readonly EditorialIssueCode[], expected: readonly EditorialIssueCode[], message: string): void {
  if (new Set(actual).size !== actual.length || actual.some((code) => !EDITORIAL_ISSUE_CODES.includes(code))) throw new Error(message);
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) throw new Error(message);
}

function articleBody(master: ContentMaster): string {
  if (master.carrier !== "article") throw new Error("Editorial loop base must be an article master.");
  return master.bodyMarkdown;
}
