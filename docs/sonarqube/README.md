# SonarQube remediation status

Baseline: `Scan 2026-10-21 115552`, analysis task
`ac87f101-0834-43a1-a03f-5de3cbcd5008`, source revision `032fc03`.
The ledger accounts for all 841 findings; source changes are NOT verified Sonar
closures until an actual follow-up scan supplies that evidence.

## Current checkpoint

Actual checkpoint scan: `2f73b35e24211b5c55d4f25afba7f39212c9ce68`, task
`11f9a0be-3a40-4825-913c-79806a48bcbd`, analysis
`1571c7e1-ac6e-42a0-82b0-ac4229db5f8f`.
The quality gate failed; production publishing was skipped.
`checkpoint-2f73b35.json` is the verification overlay for the original ledger:
281 baseline findings explicitly CLOSED, 549 still OPEN and 11 TO_REVIEW.
31 additional findings are also recorded, for 580 current open issues overall.
The original ledger's edit-stage statuses are retained as history, not closure evidence.
Subsequent ICMP helper extraction and whitespace modernization pass 149 backend
tests, 21 frontend tests and both builds locally; they await the next scan and
are not counted as additional verified closures.
The format-3 archive and spreadsheet tab `Scan 2026-10-21 201625` include
revision, analysis ID, gate ERROR, coverage 10.7% and hotspot-review state.

- ESLint 9 flat config now loads in both applications. Lint reveals pre-existing
  unused variables, empty handlers, typing warnings and other remaining debt.
  Lint is intentionally not weakened to manufacture a passing release.
- Jest/Vitest LCOV generation works. Initial observations before further tests:
  backend lines 18.43%, frontend lines 2.95%. These local percentages are NOT a
  substitute for the Sonar combined metric; coverage-baseline.json now records
  the observed 10.7% combined metric from the checkpoint scan.
- Mechanical fixes: node: imports, numeric methods, readonly members and props.
- Correctness fixes: unconditional audit hooks with permission-gated requests,
  Promise-aware SSE callbacks, line-based SSE parsing, ICMP normalization,
  redundant combobox branch, bounded JSON-fence/punctuation handling, linear
  documentation text extraction, and scoped database adapter switch branches.
- New audit records use crypto UUID suffixes without rewriting existing IDs.
  Ephemeral AI-cache hashes use SHA-256; persisted service ID hashing is unchanged.
- Tests cover permission transitions, multiline SSE, ICMP inputs, large strings,
  cache identity, audit IDs, missing scanner evidence and stale release commits.

## Second checkpoint and subsequent work
The second checkpoint has now completed for `29644d8e65d2f619a90742638a96a7e8a98781eb`:
analysis `505dc0eb-efe5-4edb-8432-87a3a490ef5b`, task
`deb98d0c-43e4-4cb2-a56a-30c003a2182f`, failed quality gate.
`checkpoint-29644d8.json` records 309 closed baseline findings, 521 baseline OPEN
and 11 baseline TO_REVIEW, plus 36 OPEN and two CLOSED additional findings.
The spreadsheet tab is `Scan 2026-10-21 204103`; observed coverage is 12.4%.
The coverage floor has been raised to that measured value. New control findings
from this scan are being remediated or individually assessed, not suppressed.

Subsequent local changes (not yet covered by that scan) include stable toast
context actions, collision-free transient IDs, timer cleanup, typed API error
messages, and form label associations. The toast regression tests first reproduced
the prior duplicate-ID/context-identity faults, then passed with the fixes.
Local frontend verification now passes 41 tests, including service/login/register
label associations and notification form interactions. The new form IDs are
unique when multiple instances render together. Both application builds pass;
frontend lint warnings and final browser/visual acceptance remain outstanding.

The following authentication batch adds typed Native session contracts and stable
auth context actions. Native refresh now includes effective permissions from the
current RBAC configuration; old-format responses still trigger a safe permission
lookup. Session generations fence late permission responses from older sessions.
Seven lifecycle tests cover revocation, disabled accounts, old-format responses,
late responses, context identity and Keycloak client-role/refresh-failure behavior.
Verification passes 163 backend tests and 48 frontend tests. Backend lint has zero
errors; frontend has zero errors but still 139 explicit-any and 12 hook warnings.
These changes require their own scan before any additional closure is claimed.

The next batch adds cryptographic identifiers for new notification channels and
history entries, preserving all stored IDs. Five tests cover same-millisecond
identity collisions, suppression, retries, Teams metadata and emoji normalization.
An HTTP regression test reproduced a private-log-path leak in the primary service
list; the permission projection now covers that route as well as status/detail.
The monitoring hook now authenticates Native SSE sessions using the REST token
and base path, validates stream snapshots, deduplicates fallback polling, prevents
overlapping requests, fences stale responses, and strips cached paths on permission
revocation. Six hook tests cover these lifecycle cases and history selection races.
Local verification passes 169 backend and 54 frontend tests, with both builds
passing. These edits are pending their own Sonar analysis, not verified closures.

- Backend ESLint: zero errors; warnings are still tracked, not suppressed.
- Frontend ESLint: zero errors, but the strict command remains blocked by 170
  explicit-any, 15 hook-dependency and two fast-refresh warnings.
- Shared select/combobox keyboard navigation, Escape, focus return, blur,
  editable free text and non-submitting option buttons have six regression tests.
- Service status now enforces raw-log configuration permissions; three HTTP
  tests verify denied/allowed projections and preservation of stored state.
- Polling SSE now awaits one snapshot per client, prevents overlapping work,
  catches failures and prevents late writes after close; four lifecycle tests
  cover completion, failure, cancellation and reconnect.
- Error middleware delegates to Express after headers have been sent.
- ClickHouse dependency, edge drilldown and export methods no longer return
  unconditional placeholder values. Parameterized query fixtures test windows,
  service-name binding, export bounds/attributes and unavailable connections.
  These fixtures do not substitute for a live ClickHouse integration test.
- Local verification: 163 backend tests, 27 frontend tests and both builds pass.
  New source changes are not counted as Sonar closures until rescanned.

## Release safety

Normal main pushes verify only. Production image publication is manual and
requires a successful same-SHA Sonar workflow containing the strict release-proof
artifact, with main still at that SHA. Release/package workflows use the same
guard. NPM publishes the checked-in package version: bump it in a normal commit
before scanning; the publish job no longer changes source after approval.

Before a scan, start the existing on-demand VM. No always-on scanner, token bypass
or new VM-start permission is introduced. The strict proof requires zero open
issues, zero unreviewed hotspots, an OK gate, a reviewed non-null overall coverage
baseline, at least 80% new-code coverage and no excessive reported new duplication.
Expected intermediate failures do not authorize publication.

## Still required before release

1. Finish the pending ledger items, including accessibility, complexity/nesting,
   ignored exceptions, remaining typing/lint debt and justified hotspot reviews.
2. Configure the fixed Sonar new-code baseline and a narrowly scoped Tailwind v4
   directive allowance. Do not disable the unknown-at-rule rule globally.
3. Continue checkpoint scans and reconcile new findings as well as baseline IDs.
   The local CLI is currently unauthenticated. The actual GitHub scan succeeded
   in submitting analysis but failed its quality gate. No server-side safe-hotspot
   reviews or false-positive dispositions have been performed.
4. Preserve the verified format-3 Sheets exporter: original columns and tabs
   remain intact, failed gates export correctly, and eight Linux operations tests
   pass, including idle-policy and export-failure scenarios.
5. Verify the CI release guard against real GitHub/Sonar API responses, test SDK
   ingestion fixtures, then perform the final same-revision scan and Flux rollout.

Useful checks:

```
node scripts/verify-sonar-ledger.cjs
node --test .github/scripts/verify-sonar-release.test.cjs
npm test --prefix backend -- --runInBand
npm test --prefix frontend -- --run
npm run test:coverage --prefix backend
npm run test:coverage --prefix frontend
npm run build --prefix backend
npm run build --prefix frontend
```

This checkpoint does not authorize deployment. Missing new-code scope and
unresolved findings must continue to block release. Consult the corresponding
GitHub run for pushed revision and scan evidence; local tests alone are not a
Sonar closure or production verification.
