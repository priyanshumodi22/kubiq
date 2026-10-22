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

Fourth verified checkpoint: commit `0f53ca2313ab0d0940637172b0ec98c9d793bdba`,
analysis `ba15c557-1dc4-4ed4-b120-017ba1990e2e`, task
`3e1b7251-4fdf-4f69-bce3-94baed93e73c`. Its overlay records 402 explicitly
CLOSED baseline findings and 439 pending, plus 45 additional findings. The scan
has 457 open issues, seven unreviewed hotspots, 21.3% combined coverage and gate
ERROR. Both SDK wrapper checks and coverage generation passed in GitHub Actions;
the analysis step failed its quality gate. Sheets tab `Scan 2026-10-22 072316`
and its archived JSON preserve the exact revision and result. No release proof
artifact or production image was published.

Changes after that checkpoint add named, keyboard-operable log-search filters,
request generations that reject stale log/source/summary responses, registration
guidance matching the backend's 12-character password minimum, and behavior-preserving
regex/string modernization. A regression test reproduced deeply nested secrets
being returned verbatim when kubi redaction reached its depth bound; the bound now
returns a truncation marker. Existing evidence tests continue to pass.
Current local verification is 218 backend tests, 67 frontend tests and both builds.
Frontend lint has zero errors but still 127 explicit-any and 11 hook-dependency
warnings; strict CI remains blocked. These post-checkpoint changes await analysis.

For the pending Tailwind v4 allowance, SonarSource documents CSS S4662's
`ignoreAtRules` rule parameter. Configure only the applicable Tailwind directives
in a project-specific CSS profile after verifying the pinned analyzer's parameter;
keep S4662 enabled. Do not use file exclusions or disable unknown-at-rule checking.
Reference: https://github.com/SonarSource/SonarJS/blob/master/docs/rule-configuration-patterns.md

Third verified checkpoint: commit `675dbef75e050f6602b49e40a2d62f4bc40d6b65`,
analysis `8f9bcbb6-b42c-46a4-b62f-1378ec97f625`, task
`2af8a30c-dbb8-4abd-b651-5bf059f4ace2`. The overlay records 374 CLOSED
baseline findings and 467 pending, plus 43 additional findings. The current scan
has 495 open issues and eight unreviewed hotspots, with 17.7% combined coverage.
The quality gate remains ERROR. The preserved spreadsheet export is
`Scan 2026-10-22 063605`. This is progress, not release approval.

After that scan, the OTLP parser is split into typed, bounded decoding helpers.
Sixteen HTTP ingestion tests cover genuine spans, trace-wide ignored routes,
numeric attributes, malformed shapes/timestamps, backpressure, oversized batches
and explicit rejection of unsupported protobuf. The prior numeric-attribute 500
was reproduced before fixing it. The normalization contract preserves persisted
identifiers and the existing numeric/string span-kind formats.
The instrumentation dialog now documents authenticated JSON direct ingestion and
an explicit private Collector bridge for protobuf SDKs. It no longer claims kubiq
automatically listens on 4318. Three Node wrapper configuration/lifecycle tests,
three Python wrapper tests, four guide tests and three log-dialog keyboard/draft
tests are added; wrapper checks run in verification and manual scan CI.
Local totals: 182 backend tests, 61 frontend tests, three Node wrapper tests and
three Python wrapper tests pass, plus both application builds. These are not a
live instrumented-client or Collector integration claim. Server-side reviews
still require the expired Cloudflare/Sonar browser session to be restored.

The monitor refactor has 12 characterization/lifecycle tests covering retry
thresholds, recovery, TLS settings, persistence failure, semaphore release and
serialization, Kubernetes alert deduplication/completed jobs/resource thresholds,
and failed-poll recovery. Tests reproduced delayed checks running after stop and
queued promises left unsettled by stop; both cancellation paths are repaired.
In-flight checks retain ownership of their semaphore slots until their finally
blocks release them. HTTP checking, protocol dispatch, certificate extraction,
pod alerts and node alerts are now separate cohesive helpers. Notification failures
are handled without changing the non-blocking delivery order. The final Sonar
scan is still required to verify complexity reductions and remaining findings.

Authorization regression tests additionally reproduced stale Native administrator
claims remaining usable after role revocation, deleted/disabled accounts retaining
access, and an empty HTTP namespace list accidentally granting arbitrary namespace
access. Native requests and Socket.IO authentication now load current account roles
and scope from persistence, fail closed on account lookup failure, and reject
deleted/disabled users. Explicitly empty namespace lists grant no namespace access
in either HTTP or socket checks. Existing default scopes apply only when no list
is configured. Keycloak's stored namespace policy is now shared by HTTP and socket
checks; lookup failures deny access rather than falling back to a broader scope.
The added tests also cover SSE query credentials, duplicate-query rejection,
expired/wrong-provider tokens and stored-policy lookup failures. These changes
still need their checkpoint scan and production acceptance before deployment.
Current local verification: 205 backend tests, 61 frontend tests, both builds,
and the three exact-commit release-gate tests pass. Frontend lint still correctly
blocks release with 129 explicit-any and 12 hook-dependency warnings; neither
those rules nor the Sonar gate has been weakened.

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

Fifth verified checkpoint: commit `84068ad9c50e0093e7c206388e3987af968b8921`,
analysis `90f1720f-4535-4506-8f04-e7910593abfd`, task
`a91a6804-9959-450a-9bd0-e13017899284`. The exact-revision export records 421
original findings CLOSED and 420 pending, plus 45 additional findings. The
current analysis has 438 open issues, five unreviewed hotspots, 22.4% combined
coverage and gate ERROR. GitHub run `39807352718` completed the analysis and
failed on the enforced quality gate as expected. The format-3 archive is
`gs://priyanshu-apps-sonarqube-backups/reports/a91a6804-9959-450a-9bd0-e13017899284-1792684000.json`.
No release proof or production image was published.

This checkpoint verifies the shared log-level parser and monotonic live-log
identities. JSON fields such as `"level":"error"` are now parsed as their value
instead of the field name, and both log viewers no longer use pseudo-random
numbers as React item identities. Exact-revision verification passed 224 backend
tests, 74 frontend tests and both builds. Coverage increased from 21.3% to 22.4%,
which is now the regression floor; it remains far below the 80% new-code target.

Sixth verified checkpoint: commit `fd838d7360668cb401d4e3fcd8b9933aa1a2ae0c`,
analysis `f8d5603f-6064-4212-bd5b-7c8814a71068`, task
`5960f712-18c9-4f51-b6ef-a50889171da3`. The exact-revision export records 421
original findings CLOSED and 420 pending, plus 46 additional findings. The
current analysis has 439 open issues, two unreviewed hotspots, 22.4% combined
coverage and gate ERROR. GitHub run `39808403868` completed the analysis and
failed on the enforced quality gate as expected. The format-3 archive is
`gs://priyanshu-apps-sonarqube-backups/reports/5960f712-18c9-4f51-b6ef-a50889171da3-1792684375.json`.
No release proof or production image was published.

This checkpoint verifies that startup jitter and avatar blink scheduling use
cryptographic randomness. It closes the three remaining fixable random-number
hotspots. The two remaining review tasks are compatibility-sensitive: the
persisted MD5 service identifier and the Teams MessageCard schema identifier.
They must be reviewed with rationale in SonarQube; neither is silently excluded
or changed in a way that would migrate stored identifiers.

Seventh verified checkpoint: commit `c711a841f67d2fcb8220867023821e0dbe00e044`,
analysis `1efbc778-caeb-4c19-a344-3a7c539a0b6a`, task
`654cd280-ece7-44be-ade7-fff865187c8f`. The exact-revision export records 435
original findings CLOSED and 406 pending, plus 47 additional findings. The
current analysis has 425 open issues, zero unreviewed hotspots, 22.4% combined
coverage and gate ERROR. GitHub run number 9 completed the analysis and failed
on the enforced quality gate as expected. The format-3 archive is
`gs://priyanshu-apps-sonarqube-backups/reports/654cd280-ece7-44be-ade7-fff865187c8f-1792684769.json`.
No release proof or production image was published.

This checkpoint verifies the nullish fallback cleanup without changing valid
falsy values, closes the numeric-separator regression, and records both
compatibility-sensitive hotspots as reviewed safe with explicit SonarQube
rationale. SonarQube now reports 100% hotspot review coverage and no remaining
hotspot review tasks.

Eighth verified checkpoint: commit `0cfa684fd99b4c13802f50a3cdfad983bbe2ab51`,
analysis `061becfe-a78f-4cd8-a5b0-c86831012526`, task
`85c1d0a3-4b5b-4347-a348-064d0741d992`. The exact-revision export records 463
original findings CLOSED and 378 pending, plus 48 additional findings. The
current analysis has 397 open issues, zero unreviewed hotspots, 22.4% combined
coverage and gate ERROR. GitHub run number 10 completed the analysis and failed
on the enforced quality gate as expected. The format-3 archive is
`gs://priyanshu-apps-sonarqube-backups/reports/85c1d0a3-4b5b-4347-a348-064d0741d992-1792685145.json`.
No release proof or production image was published.

This checkpoint verifies the optional-chaining batch across authentication,
repositories, Kubernetes, streaming, license validation, and frontend event
handlers. The batch preserved all 224 backend and 74 frontend tests and both
production builds while closing 28 open findings.

Subsequent completed analyses:

| Commit | Run | Analysis ID | Open issues | Coverage | Hotspots to review |
|---|---:|---|---:|---:|---:|
| `9dc562e` | 11 | `9b08a843-f5e6-4ea4-9047-da14dc26fa31` | 377 | 22.4% | 0 |
| `adb8c68` | 14 | `9e833685-0e64-45b7-8d45-09284db51bbf` | 337 | 22.6% | 0 |
| `3e07db6` | 15 | `f838abb0-4d37-4113-9c91-a973fd93ce7d` | 321 | 22.9% | 0 |
| `624585e` | 16 | `0ae3bc70-f159-4069-ad03-135d1ee167ac` | 319 | 23.0% | 0 |
| `292f6e5` | 17, attempt 2 | `ea22e2cf-e65e-45be-85ad-f3113840f01b` | 318 | 23.1% | 0 |

Matching format-3 exports remain in the private backup bucket under `reports/`:
`4550fc4b-64aa-45f1-8e3d-f570920514c2-1792689301.json`,
`90d565ce-30b6-470c-9f43-0aaf1f530ca3-1792689736.json`, and
`da41c988-507d-4821-9592-504a78ae1937-1792689905.json`, and
`39b8a3e1-b8e4-4fa5-b72a-ebfcc5d080ad-1792690136.json`, and
`cee4400b-4f07-47a4-aa45-0385692f2156-1792690703.json`.
The matching checkpoint files account for all 841 original findings; the latest
records 534 explicit closures, two individual safe reviews, and 305 pending
baseline findings, plus 49 findings introduced after the original baseline.

Run 11 verifies all 20 redundant-assertion fixes. Run 14 verifies browser-global
modernization and the first avatar rendering extraction. Runs 12 and 13 stopped
before analysis because the API-client origin fallback test failed without the
developer's DNS environment variables; `adb8c68` fixes that fallback and makes
the test explicitly clear those variables. Run 15 verifies all 16 namespace
overview findings closed, including native keyboard controls and stable keys.
Run 16 verifies that both the avatar frame renderer and raw Kubernetes resource
handler are below the complexity limit. It also verifies shared Secret redaction
for encoded values, plain `stringData`, and last-applied annotations. The helper
preserves resource names, keys, and safe metadata without mutating its input.
Run 17's first attempt timed out while uploading the report, so no new analysis
or closure was inferred. Attempt 2 successfully uploaded the same source commit
and verifies the Native session token-issuance refactor. All 228 backend and 77
frontend tests passed. Standard quality gate is OK; the strict release criteria
still fail because 318 issues and the new-code coverage requirements remain.

Standard Sonar gate results can be OK while baseline issues remain. The strict
release verifier and every checkpoint still reject release until the complete
remediation criteria are met. No production image or release proof was published.
