# Promo Workflow: streamlined improvement plan

Date: 2026-09-05 · Plan revision 3 · Initial implementation complete; acceptance and boundaries are in section 12

This plan replaces the earlier expansion proposal. It responds to failures observed during this article-production round and the user's latest constraint: keep the framework simple and auditable, without continually adding metrics, modules, and gates.

Text-selection annotations, next-turn processing, and lightweight version review belong to one loop: current requirements → deliverable → human annotations/editorial audit → revision and verification → new version and processing receipts. Annotations are audit inputs; versions are historical views of existing artifacts, not a parallel collaboration system.

## 1. Scope and complexity constraints

Improve only three existing objects:

| Object | Responsibility | Approach |
| --- | --- | --- |
| Current requirements | Specify the audience, content, and expression | Extend the existing editorial contract; track revisions through existing decisions |
| Current deliverable | Store the article or executable material requirements | Extend existing artifacts; reuse versions, references, and the workbench |
| Audit record | Receive annotations, identify problems, guide revisions, and explain conclusions | Link annotations and receipts to existing masterReview, artifacts, and events; no separate scoring service |

Do not add workflow nodes, approval levels, independent issue state machines, scoring databases, or automatic weight tuning. Each new field or rule must address an observed failure or explicit interaction need and identify the old practice it replaces. Reuse revisions, artifact references, and decisions rather than rebuilding versioning. Derive annotation processing status from annotation revisions and receipts instead of maintaining a separate ticket state that can drift.

During planning, only this document was edited; the user subsequently authorized implementation. Engineering implementation does not advance the active workflow or rewrite this campaign article.

## 2. Problems and minimum fixes

| Observed problem | Minimum fix | Replaced practice |
| --- | --- | --- |
| Repeated swings between “natural,” “too loose,” and “locally too tight” | One prose looseness parameter tied to skill behavior, with separate whole-article logic checks | Reexplaining naturalness each round or counting questions to manufacture hooks |
| Audience changes to beginners, but downstream work retains developer assumptions | Read effective requirements from the current editorial contract and cite the revision decision | Guessing current requirements from chat and multiple old artifacts |
| Revision report declares success without resolving the problem | Audit includes original text, cause, fix, and verification evidence | Treating “structure strengthened” as proof of success |
| Capture protocol disappears during material compilation | Pass captureProtocol through and add productionProcedure | Showing only type/purpose and attaching an unconsumed manual |
| File is saved but the node is not reviewable | Check storage, display, and consumption consistency for the current artifact | Treating notes, task briefs, or file existence as delivery |
| Paragraph feedback requires copying text back into chat | Free text-selection annotations, including cross-paragraph selections and multiple comments, read together next turn | Vague location descriptions in chat |
| Revisions do not show how individual comments were handled | Bind comments to the original version; link receipts to new-version differences and verification | Overwriting old text and reporting only “updated” |

Verified code locations:

- contracts/src/workflow.ts already has SourceAssetPlan.captureProtocol.
- promo-service/src/workflow-service.ts does not pass it through in toMasterAssetUsages.
- requirements-compiler.ts lacks the receiving requirement field.
- review-host.ts and human-review.ts render only coarse requirement descriptions.
- Video preproduction material plans already pass capture protocols; preserve that capability rather than creating separate article and video protocols.
- review-host.ts provides read interfaces and update notifications. Main views refresh by replacing innerHTML wholesale; annotation support must preserve selections, draft input, and scroll position.
- workflow-service.ts get supplies snapshots, revisions, and idempotency. Annotation reads/writes belong in the service layer, not direct browser edits to workspace projections.

## 3. Current requirements: a few controls, inherited consistently

Retain audience, article purpose, required terminology/knowledge assumptions, factual limits, and presentation boundaries in the existing editorial contract, and add proseLooseness. Prefer existing fields and verify their single authoritative read path before implementation; do not create a parallel contract.

proseLooseness is a nullable integer from 0 to 100. It expresses desired looseness, not a quality score:

- 0–24: direct and compact, with little setup or commentary.
- 25–49: moderate scenes, commentary, and pauses.
- 50–74: fuller observation and indirect transitions.
- 75–100: essay-like, allowing longer development and reflection.

The parameter changes expression only. Factual accuracy, necessary information, whole-article progression, and audience comprehension always apply. Do not impose short-sentence quotas, topic-sentence quotas, or fixed hook intervals. A value of 35 for this article is only an experimental suggestion, not a retrospectively accepted user choice.

User revisions update the corresponding requirements through existing decision records, retaining source references. Downstream work reads current requirements; old material remains historical evidence. Flag conflicts explicitly rather than executing two incompatible message sets. Audience or proposition changes use existing return paths without new approvals.

Skills translate the parameter into actionable guidance:

- Check the whole article's purpose and section relationships first.
- Assess scene development, commentary, and pauses against the setting.
- Adjust sentences last and explain intentionally retained expressions.
- Do not require every article to follow a timeline, one character, or a three-question structure.

Update article contract, master, and preview skills under plugins/ and synchronize service guidance. Use a shared mapping or consistency test to prevent host skills and service text from diverging; do not edit installation caches directly.

## 4. Audit record: one record for guidance and recheck

Extend masterReview with the requirements and deliverable versions used. Reuse the existing finding container; each issue needs only:

| Information | Requirement |
| --- | --- |
| Location and level | Whole-article, paragraph, or sentence location in the current version |
| Problem and evidence | Original excerpt, structural relationship, or reproducible signal |
| Importance | Critical or ordinary; critical issues must explain why they block this article's purpose |
| Revision guidance | Concrete action, content to preserve, and completion conditions |
| Verification result | Post-revision evidence; record honestly if unverified or unresolved |

Do not build an independent issue lifecycle. A new-version audit can reference the original issue and record resolution and evidence. If there are no issues, briefly justify whole-article progression and reader fit rather than inventing findings to fill fields.

C/L/I/E/S/R/A are optional tags and skill review perspectives, not seven mandatory scores per round. One issue may relate to multiple dimensions but is handled once. The initial version has no total score, mechanical-writing index, or complex weights.

Existing detectors for word counts, sentence/paragraph length, and repeated phrasing may help locate issues, but their output is not a semantic conclusion. Embeddings, sentence-length uniformity, and entity counts must not automatically trigger acceptance or rewriting.

Review order is fixed: whole-article relationships → paragraph roles → sentence expression. Final recheck reads current text and requirements before checking the revision report, avoiding conclusions led by “already fixed” claims.

Recheck also verifies:

- Whether the original issue is resolved.
- Whether audience fit, facts, or accepted content have regressed.
- Whether cited evidence comes from the current version.

If two successive rounds of the same kind of revision fail to improve the text, rediagnose the higher-level cause. Do not repeat polishing blindly or automatically demand renewed user approval.

## 5. Gating: three rules, no additional gates

1. **Structural validation means only that a submission is valid.** Drafts with problems must still reach the workbench; deliverable submission and a locked quality conclusion must not be inseparable.
2. **Do not declare editorial audit success while critical issues remain unresolved or required audit findings are unverified.** “Optimized” is not closure evidence without post-revision support. Code can check completeness, references, and clear contradictions; it cannot prove a model's semantic judgment.
3. **User acceptance binds to a specific version.** Record tradeoffs and remaining issues rather than rewriting acceptance as “everything resolved.” Explicitly accepted editorial exceptions use existing decisions; unverified facts remain unverified.

Do not add four new acceptance states. Existing submission results, audit conclusions, evidence gaps, and human decisions each retain their own meaning, clearly labeled in the UI.

A reviewable record must answer:

“Which requirements version → which deliverable version → which remaining issues → what verification evidence → which decision justified the next step?”

Turn audit misses reported in actual feedback into regression cases; do not create another audit scoring system. Audits may be wrong. The framework makes their evidence visible and correctable rather than promising to eliminate errors automatically.

## 6. Current deliverable: material requirements include production procedures

Preserve and pass captureProtocol. Add productionProcedure to each MaterialRequirement group as readable Markdown organized into preparation, concrete steps, finished-output requirements per usage, acceptance, and failure handling. Use existing usageId values to identify each final image's requirements rather than adding more than a dozen mandatory subfields.

The text must tell an executor:

- Which materials, environment, and demonstration inputs to use.
- The execution order and expected observations at each step.
- Composition, annotations, and output requirements for each usage.
- Which evidence to retain and how to judge completion.
- What to do when materials are unavailable or results differ.

Capture protocols constrain source authenticity; production procedures supply concrete steps. Resolve conflicts rather than allowing procedures to silently override protocols.

Node 5 reuses existing state and promo_commit with one narrow submission type, suggested as submit_requirement_details. It updates procedures for existing requirements, checking base version and requirement IDs; it does not change the master or silently remove usages. After compilation, pendingAction points to refinement. Generate the review package when refinement is complete, without adding an eighth node.

Incomplete procedures may be saved as drafts; execution review must finish before production. Nonempty text alone does not establish executability: the audit must check correspondence between steps, results, and usages.

The same requirements artifact goes to the workbench, review package, and node 6. Any separate manual should be generated from the formal requirements. Notes cannot substitute for transmitting the actual procedure. Claim changes or removal of locked usages follow existing node 4 return paths.

## 7. Text annotations: connect directly to audit and revision

### 7.1 User interaction

Selecting any text in the workbench reveals “Annotate,” where users can write feedback such as “too long” or “the causal claim does not hold.” Selections may start mid-paragraph and span paragraphs. Support multiple independent annotations. For one comment covering noncontiguous text, “Add selection” collects multiple fragments within the same deliverable before submission.

Highlight associated selections in the body. A sidebar shows original text, comments, and replies, with click-to-locate navigation. Split cross-deliverable feedback into separate annotations that can still be handled together next turn. Do not require users to select issue types, severity, or scores. Provide whole-document annotations without selections for structural feedback.

Distinguish unsaved input from saved annotations: only successful saves count as pending. Preserve input on failure and allow retry. Users can edit or withdraw their own comments, retaining history. Withdrawal is not physical deletion and does not roll back completed text changes.

Scope is text fields of formal workbench deliverables, including masters, outlines, production procedures, release copy, and video script text. Exclude image-region, video-timeline, and audio annotations, OCR, and live collaborative body editing.

### 7.2 Minimum data and reliable anchoring

Annotations are lightweight records in existing workflow storage, referencing existing artifacts. Add only two data types:

| Data | Required content |
| --- | --- |
| Annotation | ID, revision, workflow/artifact reference, original content hash, text-field path, selection array or whole-document scope, comment, creation/update time, source |
| Processing receipt | Annotation ID/revision, action and reason, new artifact/difference references, verification result or missing information |

Each selection stores start/end offsets in a normalized text representation, selected text, and short preceding/following context. Standardize index units and extraction rules, testing Chinese, emoji, newlines, and Markdown. DOM paths or offsets alone are insufficient. Retain the current plain-text Markdown display where possible; future rich-text display must preserve reversible text-position mapping.

Annotations always bind to the version visible when submitted. New versions may show corresponding locations only when context is unique and matching unambiguous. For deleted, repeated, or heavily rewritten text, show “Original location changed,” preserving original-version navigation and manual reassociation rather than guessing. Reassociation retains history.

Derive “Pending,” “Replied,” “Verified,” “More information needed,” and “Withdrawn” from the latest annotation and receipt. A reply is not resolution. Record missing-information reasons rather than pretending to reprocess them on every read.

### 7.3 Automatic next-turn processing

“Next conversation” means the next user message in the task linked to the active workflow. Saving an annotation does not trigger a background model call. The entry skill reads pending annotations from promo_get before deciding how to execute the turn. The initial version does not scan other tasks or promise delivery to arbitrary chats that have not opened the workflow.

Add reviewFeedback to the snapshot, returning pending summaries and fully readable annotation bodies. Paginate large results rather than silently truncating. Reading does not mark completion. Each turn adopts an explicit annotation-revision set and executes:

1. Read current requirements, current text, and pending annotations. Check whole-article structure, requirement conflicts, and outdated versions first.
2. Diagnose related comments together; fix the whole article before local wording. One edit may address several comments, but each gets its own receipt.
3. Revise within current permissions and node scope. Explain tradeoffs when feedback conflicts with locked requirements rather than silently overriding the contract. If the user says not to revise yet, retain pending comments.
4. Submit the new version and individual replies explaining locations, reasons for unchanged text, and verification, with clickable differences.
5. Recheck under existing audit rules. Replied annotations do not permit progression while critical issues remain unresolved.

Saving comments is not approval, node advancement, or unlocking. Explicit revision requests for locked text use existing return paths next turn. Explain effects on other locked requirements, claims, or usages and apply existing rules without broadening edit authority.

Concurrency and retries extend existing version checks and idempotency. Receipts bind to specific annotation revisions; recheck comments added, edited, or withdrawn during execution before submission. Comments outside this turn remain pending. A revised artifact and successful revision receipts must stay consistent in one service submission: failures must not leave “fixed” receipts. Projection refresh can retry after persistence, but the UI must clearly report incomplete synchronization.

## 8. Lightweight version review: expose existing history

Do not create Git-like branches, merges, or another full-text repository. Group artifact versions by existing logical deliverable, showing current, previous, and historical versions. Distinguish body versions from workflow revisions: saving a comment does not create a body version.

Each version displays creation time, change summary, related annotations, audit, and user decisions. Provide adjacent-version paragraph/text differences and navigation between original text → annotation → reply → revised text. Old versions are read-only; old annotations remain available after switching versions. Show initial versions normally when there is no difference.

The initial version supports viewing and comparison, not one-click overwrite restoration. Restoring earlier text creates and audits a new version next turn. History is not rewritten and old approvals do not transfer.

Updates must not interrupt selections or lose unsaved feedback. Keep the current view while users select or annotate; notify them when a new version is available. Handle unsaved input before switching rather than replacing the whole body.

The desk becomes “read-only body, writable annotations.” Narrow annotation endpoints validate workflow, artifact, field, version, and length in the service layer, with shared persistence. Restrict request origins and use session validation/cross-site tokens. Accept no arbitrary file paths or execution instructions. Render annotations and replies as untrusted text so they cannot inject HTML or override system rules.

## 9. Implementation order and locations

| Work package | Main locations | Required outcome |
| --- | --- | --- |
| A: gates and audit records | master-development.ts, workflow-service.ts, human-review.ts, contracts | Draft submission; audit success constrained by critical issues and current evidence; clear acceptance semantics |
| B: current requirements and skills | baseline/creative-outline/master-development, guidance, plugins | Consistent audience assumptions; looseness changes guidance; cumulative checks against effective requirements |
| C: complete material procedures | requirements-compiler.ts, workflow-service.ts, production.ts, review-host.ts | Preserve protocols; refine at node 5; all three consumers use the same formal procedure |
| D: annotation loop | contracts, workflow-service.ts, review-host.ts, entry skill | Arbitrary selections, multiple comments, reliable saving, next-turn reading, individual receipts; A's audit/version constraints |
| E: historical review | Existing artifact index, events, workbench text view | Version switching, differences, annotation/edit navigation; no separate version store |
| F: regression and compatibility | Existing service, guidance, and desk tests | Cases below pass, including a real browser interaction loop |

A first addresses false passes; B and C each form a complete reviewable change. D establishes selection → save → next-turn revision → receipt; E exposes existing version relationships. Deliver D and E as a complete interaction capability. Add tests with each package; F closes end-to-end verification. Do not build generic infrastructure without consumers. Confirm concrete type names against existing contracts before implementation without expanding into new subsystems.

## 10. Acceptance: actual failures and new interactions

1. Beginner requirements override old developer assumptions downstream.
2. The same factual draft at looseness 15/35/65 shows distinguishable expression while preserving facts and progression; assess through text comparison, not numeric target rates.
3. An audit identifies section relationships in text that is locally coherent but fails to progress overall; timelines or questions alone do not establish success.
4. A passed=true submission with unresolved critical issues is rejected as contradictory; problematic text can still be submitted for review.
5. Old verification cannot directly prove a revised draft passes; unchanged observations may be cited with explicit scope.
6. A temporarily accepted version retains its remaining issues.
7. One material group with two usages exposes the protocol, steps, and both finished-image requirements in the desk, review package, and production task.
8. Node 5 procedure changes preserve the locked master hash; old review packages do not count as approval for new requirements.
9. File saving, notes, or task briefs alone cannot establish visible formal delivery.
10. Cross-paragraph selections, added noncontiguous selections, and three consecutive distinct comments restore accurately after refresh; whole-document comments need no fake selection.
11. Chinese, emoji, repeated sentences, Markdown, and newlines do not cause anchor drift. Deleted or nonunique selections explicitly report changed locations while preserving originals.
12. If the next user message is just “continue,” the agent reads and handles all pending workflow comments with individual replies. “Do not revise yet” prevents body changes. Users need not paste comments into chat.
13. Comments added during processing survive; edited/withdrawn comments cannot be marked complete under stale feedback; retries create no duplicate annotations, body versions, or receipts.
14. Conflicting comments or required user choices explain the conflict and remain pending. Replies without new-version revision evidence do not show “Modified” or “Verified.”
15. One edit can address multiple comments with navigation between originals, comments, replies, differences, and audits. Historical acceptance stays tied to its original version.
16. Update notifications preserve selections, input, and scroll. Save failures can retry; forged cross-site writes, out-of-scope artifacts, and HTML injection are blocked.

Program tests cover versions, references, field propagation, contradictory conclusions, and rendering. Editorial case reviews cover long-range logic, natural expression, and revision effectiveness. Run existing npm run build and npm test, checking established article/video paths without destructive tests on real workflows.

## 11. Compatibility and limits on expansion

Old artifacts remain readable and unchanged. Old audit passes display as historical conclusions without fabricated missing evidence. Unset parameters stay unset. Historical acceptance is not automatically revoked; new revisions validate against the new contract.

Replay this round's cases in test data first. Production manuals in active workflows are inputs to verify, not automatically captured evidence or approved proposals. Release through existing build, plugin versioning, and installation procedures.

Old workflows without annotations have empty feedback lists and retain their progression behavior. Do not fabricate historical annotations or audits. Add missing historical read indexes rather than migrating to a second full-text store.

Completion of the sixteen acceptance cases delivers the initial version. Defer total scores, automatic weights, mechanical-writing indexes, knowledge graphs, independent audit-agent systems, real-time collaboration, branching/merging, nontext annotations, and background wakeups. New mechanisms must cite a concrete failure, explain why the three existing objects are insufficient, and assess whether removing or changing an old rule would solve it first.

## 12. Initial implementation record (2026-09-05)

Implemented:

- proseLooseness passes between contract and outline; master tasks receive current baseline and outline. Shared service guidance controls looseness and host skills reference the same mapping, without a total score.
- masterReview.audit stores requirements/master hashes, whole-article judgment, and located issues with actions and verification. Failed drafts remain visible; pass conclusions must be consistent. User acceptance of remaining editorial issues is recorded separately and does not erase factual gaps.
- captureProtocol reaches formal requirements; productionProcedure flows to the review package, desk, and production task. submit_requirement_details refines in place at node 5. Returning to node 5 preserves steps rather than losing them through recompilation.
- The text desk supports cross-paragraph selections, added fragments, whole-document feedback, multiple annotations, editing/withdrawal, highlighting, old-version review, and differences. Annotation revisions and reassociation retain history.
- promo_get provides reviewFeedback; promo_text_review reads complete text history; new submissions can include individual annotationReceipts. reply_annotations handles explanations or missing information without rewriting; request_text_revision routes explicit feedback through existing return paths and decisions, without new nodes.
- Serialized file-store read-modify-write; annotation revision checks, idempotency, cross-site write protection, and escaping. Formal submissions persist before projection, with recoverable projection failure and no duplicate mutation.
- Fixed old locked masters obscuring new drafts; removed external font dependencies that blocked local page loading.

Validation: npm run build; automated service/interface tests; real Chromium interaction tests using independent temporary data. Browser checks covered cross-paragraph/multiple selections, consecutive annotations, updates preserving input, save failure/retry, persistence after reopening, original-version anchors, differences, and safe HTML text. Tests did not write to active campaigns. packages/promo-mcp/test/text-desk-browser.mjs uses the installed Playwright Node interface; the testing skill's recommended Python interface was not installed in that environment.

Deployment: base plugin 0.2.0, article editor plugin 0.3.1. Updates used normal plugin installation commands, not cache edits. Open tasks do not automatically reload tool lists after file updates; reload plugins/open a new task to use new tools and guidance.

Implementation simplifications and boundaries:

1. Annotations use their own revisions without raising the workflow revision, so saving a comment does not invalidate frozen review packages. Annotation events still enter existing history.
2. Original text and annotations return in full without silent truncation. Large-scale history pagination is not yet implemented; introduce it when measured growth requires it for this local single-user article workflow.
3. Text differences use bounded common-prefix/suffix comparison without diff dependencies, branches, or merging. Scattered edits may appear as a larger changed region; full original versions remain readable.
4. New-version navigation is provided only for unique references/context. Otherwise, preserve original anchors and manual reassociation without claiming successful intelligent migration.
5. Next-turn processing depends on the linked task loading the new entry skill and executing the tool loop, not background wakeups. Annotations do not automatically approve work.
6. Program acceptance proves references, state, display, and persistence, not natural or deep writing in every article. Actual 15/35/65 comparisons and long-range logic miss rates still need calibration through real writing trials; this round did not claim those subjective outcomes as automated test successes.
