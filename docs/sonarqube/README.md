# SonarQube remediation status

Baseline: `Scan 2026-10-21 115552`, analysis task
`ac87f101-0834-43a1-a03f-5de3cbcd5008`, source revision `032fc03`.
The ledger accounts for all 841 findings; source changes are NOT verified Sonar
closures until an actual follow-up scan supplies that evidence.

## Current checkpoint

Latest local verification: frontend lint has zero warnings/errors, all 306
frontend tests pass, the production build passes, and LCOV contains all 97
production files (64.94% frontend line coverage). Both new run-62 findings are
corrected and await the next exact-revision scan. Production remains held.

Run 62 verifies `b903adbc234eeeffba619ce30689dab66912f4fd`: 48.5%
overall coverage, no unreviewed hotspots and two newly introduced cleanup
findings (redundant cast and comparator complexity). All 841 baseline findings
retain verified dispositions. The matching archived report has 915 rows:
`gs://priyanshu-apps-sonarqube-backups/reports/6e5082ab-06ba-41d8-aa8b-67810057cb11-1792883728.json`.
Sheets tab: `Scan 2026-10-24 231522`. Both findings are fixed in the following
source batch, with characterization tests for name/restart/age sorting, including
null dates and missing-value ties. A fresh scan must verify their closure.
GitHub application verification passed for b903adb. Scan 61 stopped before
analysis because of an asynchronous CSV test assertion; that test now controls
the response promise and waits for modal closure after the download completes.

Rollback image retained: `priyanshumodi22/kubiq:main-56`, digest
`sha256:eebbccbf53e4b173de1e2daeb25cb029504f9c555d69e953ca3a90907b6ed874`.
The cluster is Ready and its Flux applications remain Ready. A fresh backup
`postgres/20261024T231736Z.dump` was restored into a disposable verification
database and matched all 915 issue records; the live database was not overwritten.

The final frontend lint batch passes **zero errors and zero warnings**, without
rule exclusions or threshold changes. Local verification passes 284 backend tests,
303 frontend tests, both builds, all 17 analysis/release/coverage guard tests and
both SDK exporter suites. Frontend coverage is 64.74% across all 97 production
files. New types preserve the mixed normalized/raw Kubernetes contracts; APM
filter tests verify single requests and the latest service selection without
reselecting a trace. This source still requires its matching fresh Sonar scan.
Backend lint passes its existing configured gate, with pre-existing advisory
typing warnings; those warnings are not represented as a zero-warning result.

The following unscanned typing batch passes 301 frontend tests and the production
build. Frontend ESLint is down to zero errors and 47 warnings, with rules intact.
Namespace resource/quota models, Kubernetes discovery failures and Profile
callbacks are typed explicitly. Tests cover unit parsing, health counts, quota
thresholds, unavailable contexts, explicit refresh and preservation of unsaved
profile edits. Frontend line coverage is 64.53%, with all 96 production files in
LCOV. The next exact-SHA scan and application lint pass remain required.

Run 60 verifies `af6d63c87a081046f0090b8e4a11dd3c8a4fcf82`: zero open
issues, zero unreviewed hotspots, 47.2% overall coverage and a passing quality
gate with the fixed new-code baseline. The GitHub scan completes successfully.
Source verification: 284 backend tests, 278 frontend tests and both builds pass.
Archive: `gs://priyanshu-apps-sonarqube-backups/reports/5bfb3325-2730-45d0-93b7-72ef4e22c615-1792867600.json`.
The separate frontend lint gate still has 81 warnings at this source; production
remains held pending lint and the remaining end-to-end acceptance checks.

The next local batch passes 291 frontend tests and the production build, with
62.33% frontend line coverage and all 96 production files represented in LCOV.
It preserves pod phase/reason/termination display with explicit types, and tests
passkey cancellation/server-message precedence plus public status request failures.
Malformed or null failures now produce bounded fallback text instead of throwing
from error handling. These source changes require their own final exact-SHA scan.

Run 59 verifies `5f7ba04ee3a5eb4c04c009a6ecb2dd4bb6d5d7c3`: zero open
issues, zero unreviewed hotspots and 46.9% overall coverage. Pinned new-code
coverage is 78.7%, below the unchanged 80% requirement, so production remains held.
Source verification: 284 backend tests, 270 frontend tests and both builds pass.
Archive: `gs://priyanshu-apps-sonarqube-backups/reports/20ea4d91-8cb1-46d6-87d7-bdaa2c95581b-1792866772.json`.
Sheets tab: `Scan 2026-10-24 183246`.

The next local batch passes 278 frontend tests and the production build. It adds
pod metrics lifecycle coverage and service polling/retry/malformed-stream tests,
stabilizes authorized explorer refresh and auth cleanup callbacks, and types
topology resources and terminal sockets. All 96 production files remain in LCOV;
local frontend line coverage is 62.12%. These changes still require a fresh scan.

Run 58 verifies `a00694c86d5fac5d8bcc77aba5b904dab7714859`: zero open
issues, zero unreviewed hotspots and 45.9% overall coverage. The bounded request
error helpers and typing changes introduce no new issues. Standard gate remains
ERROR; production is held. Source verification: 284 backend tests, 259 frontend
tests, frontend LCOV records for all 96 production files and both builds passing.
Archive: `gs://priyanshu-apps-sonarqube-backups/reports/9324fcc3-9bbb-47b5-8620-58ae1ca6dad0-1792866172.json`.
Sheets tab: `Scan 2026-10-24 182244`.

The following coverage batch passes 270 frontend tests. It adds APM CSV/filter,
invalid-time, export failure/retry, relative/absolute time-range and trace lookup
coverage, plus Native/SSO rotation, permission-denial, logout failure, registration
and stale-initialization tests. Local frontend line coverage is 61.56%; that is
not the combined or new-code Sonar measure. The actual scan must establish the
new-code result. All 96 production frontend files have LCOV records.

Run 57 verifies `d7c95c9acf652313b61a3197116d10ca45f07a65`: **zero open
issues and zero unreviewed hotspots**, with 44.3% overall coverage. The remaining
user-row complexity finding is CLOSED. All five individually reviewed ARIA
findings are RESOLVED with authenticated UI rationale and matching export.
Archive: `gs://priyanshu-apps-sonarqube-backups/reports/459eb6a3-c156-46fc-9bd6-8bfed8d41e92-1792865165.json`.
Sheets tab: `Scan 2026-10-24 180558`. This source passed 284 backend tests,
248 frontend tests and both production builds. Standard gate remains ERROR;
new-code coverage is 75.6% against the unchanged 80% requirement. Coverage and
the separate zero-warning CI lint gate still need completion.
Frontend ESLint currently has zero errors and 115 warnings before the next
API-boundary typing batch. No production image has been published.

The next typing/verification batch reduces frontend warnings from 115 to 95
without disabling rules: typed pass-through API payloads, unknown span attributes,
bounded transport error text/status and callback-stable authorized user loading.
259 frontend tests and the production build pass. The explorer tests exercise
resource routing, selection/filtering, RBAC denial/retry, polling cleanup and
offline behavior; transport tests preserve WebAuthn, notification and diagnostic
payloads. Fresh LCOV covers all 96 frontend production TS/TSX files.

Release verification now also requires the latest exact-SHA application
verification job to have passed lint, tests and builds. A successful Sonar run
alone cannot authorize release images, binaries or npm publication. The helper
rechecks main after reading the proofs, and release image/asset workflows recheck
immediately before publication. Thirteen guard/setup tests pass, including failed,
pending, stale-SHA and newer failed verification cases. No publishing workflow
was dispatched during remediation.

Run 56 verifies `ce8826f0959d29c2cd335b0f583f57cb20a08e48`: six open
issues, 44.3% overall coverage and zero unreviewed hotspots. All ten Kubernetes
findings are CLOSED. Remaining: one user-row complexity finding and five
individual ARIA/native-element findings requiring contextual review.
Archive: `gs://priyanshu-apps-sonarqube-backups/reports/4fc130a9-283a-4703-a667-c34601338007-1792864417.json`.
Sheets tab: `Scan 2026-10-24 175334`. This source passed 284 backend tests,
246 frontend tests and both production builds. Release remains blocked.

Run 55 verifies `c9f70f657dbb2870a27aaf804197d11b1614bf6b`: 16 open
issues, 43.6% overall coverage and zero unreviewed hotspots. All six service-detail
findings and seven user-management findings are CLOSED. The user-row renderer
still scores 16 against the limit of 15; its remaining identity rendering is
now extracted in source and awaits verification. Standard gate remains ERROR.
Archive: `gs://priyanshu-apps-sonarqube-backups/reports/6b37bf0c-95a9-42e9-83a9-0983e85c29f8-1792864020.json`.
Sheets tab: `Scan 2026-10-24 174653`. This source passed 284 backend tests,
228 frontend tests and both production builds.

Run 54 verifies `e6f31051af6f49233824dd6e6b4de7702701d150`: 29 open
issues, 42.0% overall coverage and zero unreviewed hotspots. All sixteen
Add/Edit Service, status-page form and kubi panel findings are explicitly
CLOSED. The standard gate remains ERROR; release remains blocked.
Archive: `gs://priyanshu-apps-sonarqube-backups/reports/cfb0a7a0-edbf-4ada-aed7-24283074160f-1792839165.json`.
Sheets tab: `Scan 2026-10-24 105240`. This source passed 284 backend tests,
221 frontend tests and both production builds.

Run 53 verifies `a21818d4d80578ee015dc80d62eb17453d3c6002`: 45 open
issues, 40.8% overall coverage, zero unreviewed hotspots. All four Login/API
findings are explicitly CLOSED. Pinned new-code coverage is 74.4% on about
1.9k lines to cover; three new-code issues and the 80% coverage requirement
keep the standard gate ERROR. The threshold is unchanged.
Archive: `gs://priyanshu-apps-sonarqube-backups/reports/0df49f22-464e-4aa1-ae22-d8ed2141599e-1792838662.json`.
Sheets tab: `Scan 2026-10-24 104413`. Local verification for that source:
284 backend tests, 210 frontend tests, both production builds passing.

Run 52 verifies `8905362130cd0e3c8ebe4180f31a1c7c577f3444`: 49 open
issues, 40.5% combined coverage and zero unreviewed hotspots. Both redundant
backend type aliases are explicitly CLOSED. The standard gate is ERROR after
pinning the approved fixed new-code scope; production remains blocked.
Archive: `gs://priyanshu-apps-sonarqube-backups/reports/484aa65b-b6f9-4b78-8b83-8114fbf4f724-1792838207.json`.
Sheets tab: `Scan 2026-10-24 103640`. Login and API caller changes are source
fixes awaiting their own scan, not counted as verified closures here.

Run 51 verifies `d1936eb673c9c925d76359a757108037a3761958`: 51 open
issues, 40.5% combined coverage, zero unreviewed hotspots and standard gate OK.
All nine log-page, protocol-state and send-contrast findings in that batch are
CLOSED. Archive: `gs://priyanshu-apps-sonarqube-backups/reports/9dbac5e1-9f7a-404b-9f1f-1e6e776970c2-1792837374.json`.
The original ledger has 793 explicit closures, 44 pending findings, two safe
reviews and two false positives; additional findings are still reconciled.
Production remains blocked by the strict zero-issue gate.

After this scan the user approved pinning the first coverage-enabled analysis:
`1571c7e1-ac6e-42a0-82b0-ac4229db5f8f`, source `2f73b35`, on kubiq/main.
The one-use setup run `40085754467` applied SPECIFIC_ANALYSIS successfully,
then reported a read-back mismatch because this server omits the false/default
inherited field. Authenticated UI and the exact API JSON confirm projectKey
kubiq, branchKey main, type SPECIFIC_ANALYSIS and the approved value. The
verifier now accepts omitted/false inherited only for that exact project,
branch, type and analysis, while rejecting rolling, inherited or mismatched
definitions. Routine scans check scope before and after analysis and bind the
scope proof to their SHA; ten workflow guard/setup tests pass.

The temporary administrator token was revoked automatically and its absence
was confirmed in a refreshed Sonar token inventory. Deleting the unusable
GitHub secret copy was removed after the user's Confirm access reauthentication;
a fresh repository-secrets inventory confirms SONAR_BASELINE_ADMIN_TOKEN is absent.
The one-use workflow is removed from source.
Normal scan/read credentials are unchanged, with no administrator secret used
by the routine scan workflow. The next analysis must verify metrics against
the newly pinned scope; the prior rolling-scope gate is not fixed-scope evidence.

Run 50 verifies `52c95ebdd19dd75df7098ffb23be6bf79147b44a`: 60 open
issues, 39.1% combined coverage and zero unreviewed hotspots. All four Profile
findings are CLOSED. The standard quality gate is ERROR: authenticated UI
inspection shows new-code coverage 75.8%, below 80%, on 20 lines to cover.
No threshold was lowered. Archive and Sheets export completed, including this
failed gate: `gs://priyanshu-apps-sonarqube-backups/reports/29071a56-9b56-468a-95f8-1821914253ac-1792836647.json`
and tab `Scan 2026-10-24 101040`. The original ledger has 784 explicit closures,
53 pending findings, two reviewed-safe hotspots and two individual false positives.

At run 50, the new-code settings UI followed the instance default Previous version.
Because scanner versions are commit SHAs, this scope moves between batches; it
was NOT the planned fixed remediation baseline. It was subsequently pinned as
described above; fresh verification against that scope remains required.

Run 49 verifies `5bb8caaae1dbe05e5d24403125ec95f50cec4338`: 64 open
issues, 39.0% combined coverage, zero unreviewed hotspots and standard gate OK.
All five read APIs work with the Browse-only credential. The strict gate
correctly fails on the remaining findings, not authentication. Its archive is
`gs://priyanshu-apps-sonarqube-backups/reports/c3cc40be-bb45-43bd-a486-0b651a83bc4d-1792799300.json`.
The original ledger now has 780 explicit closures, 57 pending findings, two
reviewed-safe hotspots and two individually reviewed false positives.

Run 48 verifies `3dc7714d106e9154151f02da3f7c3cc5cddb1a08`: 68 open
issues, 38.5% combined coverage, no unreviewed hotspots and standard gate OK.
The five Tailwind directives and four monitor findings are closed. Four exact
accessibility IDs have RESOLVED export status, matching their individually
verified False Positive UI dispositions and documented evidence.
Archive: `gs://priyanshu-apps-sonarqube-backups/reports/349a3a8e-6740-47a5-b6a2-937dde78a1e0-1792798972.json`.

The strict GitHub verification no longer fails with HTTP 403: run 48 reads
the exact analysis, quality gate, open issues and hotspots using the new account,
then correctly blocks release on 68 remaining issues. The next revision also
reads measures before evaluating issue counts so every read endpoint is exercised
even during remediation.
The project analysis credential is not widened. The approved separate
`kubiq-release-verifier` account now has Browse only on the private kubiq project.
It has no source-code, issue/hotspot administration, analysis or global grants.
The default sonar-users global analysis/project-creation and kubiq issue/hotspot
administration grants were removed with approval; the existing administrator
scanner owner retains Execute Analysis explicitly on kubiq. A 30-day user token
is saved as `SONAR_READ_TOKEN` in repository Actions secrets, separately from the
unchanged `SONAR_TOKEN`. Strict verification requires the read token with no
analysis-token fallback. Five release guard tests pass, including missing-token
failure and credential-safe errors. A sixth test checks all read API paths and
the correct Authorization header for a blocked analysis. The read token expires
November 22, 2026; the unchanged project analysis token expires November 20, 2026.
Production remains blocked.

The next batch replaces normalized namespace membership scans with a Set,
extracts container-state selection without changing precedence, moves the header
avatar out of its parent to preserve DOM identity, and extracts quoted RBAC verbs
without changing YAML output. Local checks pass: 284 backend tests, 184 frontend
tests and both builds. Run 48 confirms those findings closed: 776 original
findings are now explicitly CLOSED, 61 remain pending, two are reviewed safe
and two are individually reviewed false positives. The 72 additional exported
findings include closed items. The full original 841-row ledger is preserved.

The subsequent source batch replaces index keys with semantic day/now tick IDs
and uptime units, removes a commented debug statement and makes model-label
spacing explicit. All 187 frontend tests and the frontend build pass. Tick
retention, midnight collisions and uptime DOM identity have regression tests.
Run 49 confirms these four findings closed.

The profile batch additionally narrows FileReader results to real strings,
preserves first matching kubiq role selection via find, uses concise avatar alt
text, and extracts passkey loading/empty/list rendering with named native
actions and visible keyboard focus. Existing stored passkey IDs and backend
requests are unchanged. All 194 frontend tests and the frontend build pass;
seven new tests cover image read success/failure and passkey rendering/actions.
Run 50 confirms these four profile findings closed.

The subsequent batch uses separate native log-selection buttons and sibling
edit/remove actions, with focus visibility and no nested buttons. It also
removes the duplicate React import and extracts viewer selection without changing
viewer keys or requests. Header Pro status reads now require system.read, avoiding
denied requests from management-only users. Avatar protocol state checks use
Object.hasOwn with only the ES2022.Object library declaration added, consistent
with the existing ES2022.Array runtime baseline. The send control retains its
geometry with darker blue backgrounds; white-content contrast is tested at 4.5:1
or greater in both states. Profile inputs now have associated labels, and parent
save/rename flows have integration tests. All 202 frontend tests and the frontend
build pass; source closures await a matching scan.

The next mechanical backend batch removes the two redundant string aliases
for extensible role names and permission keys and updates every internal
consumer across JSON, MySQL, MongoDB and RBAC. It does not constrain custom
strings, change serialized fields, run a data migration or alter authorization
logic. All 284 backend tests and the backend TypeScript build pass. Its two
findings are not counted closed until an exact-commit scan confirms them.

Run 46 was not separately archived before the next analysis. The existing VM
exporter selects the latest completed report when its queue is empty; this needs
a per-analysis export barrier before promising every intermediate scan is saved.
Run 47 is the verified combined checkpoint, not substituted evidence for run 46.

The setup-read policy also removes automatic system.access -> system.read
expansion for new/updated custom roles. User management gains only the UI shell
dependency; existing stored role grants are not rewritten. Existing kubi
configuration's system.read dependency is explicitly preserved. Real role
evaluation (not a mocked permission predicate) now drives the HTTP setup matrix.
Verification passes 282 backend tests, 182 frontend tests, both builds, four
release-guard tests and complete frontend LCOV records. Source changes still
await the next exact-commit scan.

The dedicated Sonar verification account and separate token are now provisioned
and live-verified as described above; no user password is stored in the repository.

Run 45 verifies `eb9507f821a055c954b082bc9edd6330d47a1e69`: 88 open
issues, 38.0% combined coverage, no unreviewed hotspots and standard gate OK.
Raw-log complexity and both Pro copy findings are now closed. Run 44 verified
`1a52a421a1e5eb69733955eaf15f72cb1349e542` with 91 open, 37.9% coverage
and historical log search findings closed. Archives:
`gs://priyanshu-apps-sonarqube-backups/reports/a813853b-af0f-477a-a5b5-f4107c999ee2-1792761310.json`
and `gs://priyanshu-apps-sonarqube-backups/reports/efc9b2e0-6b30-4371-b29a-eef676b4e28d-1792760958.json`.

The user approved narrowly required management setup reads. User managers may
read the assignment role catalogue, not permission editing or role mutations.
System configuration permits disk/APM setup reads and configuration writes,
without granting stats, predictions, license state or kubi configuration.
The UI skips role-editor permission and unauthorized overview requests. Three
HTTP matrix tests and a user-manager component regression cover these boundaries.
Local verification: 278 backend tests, 181 frontend tests and both builds pass.

Sonar CSS profile `kubiq Tailwind v4` extends Sonar way with all 27 active rules
retained. Its only override appends `plugin,utility` to css:S4662 ignoreAtRules;
the built-in/global default is unchanged. The profile is associated only with
kubiq. The following scan must verify the five valid-directive findings close.
Four individual accessibility review candidates (Footer and canvas avatar) remain
pending until authenticated review plus export evidence; they are not exclusions.

The four exact accessibility issue IDs have now been individually marked False
Positive in the authenticated Sonar UI with their test/standards rationale. The
next completed export must verify these statuses before the ledger counts them
as reviewed. No bulk acceptance or rule deactivation was used.

Monitor cleanup calls the existing semaphore-protected public check directly
instead of its deprecated private forwarding wrapper, removes a redundant empty
header-spread fallback, and normalizes two catch names without changing failures.
All 278 backend tests, TypeScript build and three release-guard tests pass.

Run 43 verifies `bee9de4849b4c84e11cbcda7f465c7ee64961ade`: 93 open
issues, 37.8% combined coverage, no unreviewed hotspots and standard gate OK.
Notification status/severity and kubi trace matching findings are closed.
Source-selector extraction alone did not reduce the remaining raw-log complexity
finding, so it is still pending. Archive:
`gs://priyanshu-apps-sonarqube-backups/reports/fad4378c-4be9-4a49-9cc0-00be25461d09-1792760686.json`.

The next refactor isolates the tail/pause button presentation. Pro availability
copy uses explicit branches instead of nested ternaries; three tests preserve
unconfigured/disabled messaging versus normal upgrade/pricing behavior.

Run 42 verifies `cda178d71153e9da9d9cc4f54181445f3f981e27`: 97 open
issues, 37.7% combined coverage, no unreviewed hotspots and standard gate OK.
The histogram finding is closed; raw-log component complexity remains at 17.
Archive: `gs://priyanshu-apps-sonarqube-backups/reports/30058b24-20c1-4473-96e5-f6bbe5633b7a-1792760375.json`.

The following batch extracts the stable source selector and adds a sixth raw-log
test proving source switching closes the menu, stops the old subscription and
watches the new path. All 172 frontend tests pass; build and scan evidence are
required before recording further closures. The strict release gate stays held.

Historical search now shares the summary presentation with raw logs and uses a
stable virtualized row renderer. Four additional tests cover loading/success/
missing-summary states and historical timestamp/severity/source/message display;
existing stale-response and keyboard-filter tests remain passing. Local frontend
verification: 176 tests, build and LCOV records for all 86 production TS/TSX files.

Run 41 verifies `0f747b09418f3fe0ed0032443f8528e3e35adf9e`: 98 open
issues, 37.6% combined coverage and no unreviewed hotspots. Its standard gate
is ERROR, so production remains held. The three MySQL/notification findings
are closed. Archive:
`gs://priyanshu-apps-sonarqube-backups/reports/efd46164-1d6b-4659-b3ef-e632313ab06c-1792760078.json`.

The next log-viewer refactor keys histogram bins by their represented line
range and extracts stable file-tab/source resolution helpers. A fifth raw-log
test preserves the 15-bin distribution, severity counts, resolved file switching
and clean buffer. Local frontend verification: 171 tests, production build and
complete LCOV records. Exact-commit scan verification is pending.

The kubi trace-ID lookup now uses RegExp.exec directly (same non-global pattern,
word boundaries, case handling and first-match result). Both kubi service/evidence
suites pass all 14 tests and the backend build; no provider configuration changed.

Notification status unions now share a named type. Explicit status/severity
helpers preserve failure-before-warning precedence and existing PagerDuty
trigger/resolve mapping. Four table-driven payload/history tests cover these
branches; all 275 backend tests and the build pass. This batch does not change
transports, credentials, destinations, retry scheduling or maintenance policy.

Run 40 verifies `0dd4e8f30bda34fab232836d23f54d20f0183ee9`: 101 open
issues, 37.1% combined coverage, no unreviewed hotspots and standard gate OK.
Eight log-viewer findings are now closed; histogram identity and component
complexity remain. Archive:
`gs://priyanshu-apps-sonarqube-backups/reports/33b9100c-4352-4714-9c65-b978fb84e8ab-1792759849.json`.

Additional regression tests reproduced stale subscriptions for changed service
context and changed path/limit under the same source identity. Explicit effect
dependencies now rebind and clean up these subscriptions while pause changes do
not reconnect. All 170 frontend tests and the build pass. This follow-up awaits
an exact-commit scan; production remains blocked.

Run 39 verifies `fec32eb61cf971bfb79c6e3c13d228183b5fd9f1`: 109 open
issues, 36.0% combined coverage, no unreviewed hotspots and standard gate OK.
The strict release gate remains blocked. All 841 baseline findings are accounted
for: 741 explicit closures, two individually safe reviews and 98 pending items.
Archive: `gs://priyanshu-apps-sonarqube-backups/reports/daa3cca1-8a7e-4a62-a3f4-18416ac62e63-1792759407.json`.

The next raw-log batch reproduces and fixes stale pause-state counting, explicitly
stops subscriptions and removes listeners on cleanup. Stable row rendering,
typed socket/list refs, summary-body extraction and mechanical Sonar fixes retain
the existing layout and trace links. Both new tests failed before the fixes and
pass afterward. Local verification: 168 frontend tests, production build and
LCOV records for all 85 production TS/TSX files. Its exact-commit scan is pending;
these source edits are not yet claimed as Sonar closures.

The following MySQL batch replaces repeated column-array membership checks with
a Set and makes the optional SSL update branch positive without changing SQL or
null/undefined semantics. Notification creation still defaults only undefined
enabled values to true. Five adapter compatibility tests cover existing/missing
columns and SSL expiry omitted/null/date cases. Backend verification passes all
271 tests and the build. Current lint inspection has zero errors but still 371
backend and 118 frontend warnings, so strict zero-warning lint is not complete.

Run 38 verifies `05aa0b267d7630e05a018ffd7cdf19e57a4ee4d0`: 111 open
issues, 35.8% coverage, no unreviewed hotspots; standard gate ERROR. Backend
identity/resource findings and most administration findings are CLOSED.
The remaining administration items are the namespace dialog and a new
boolean-selector helper warning; both are addressed by the next batch. Archive:
`gs://priyanshu-apps-sonarqube-backups/reports/f4314246-696c-44a7-9c9d-e42cc02a2ae8-1792758613.json`.

The next batch extracts a native namespace dialog and explicit add/remove
selection operations. Five dialog tests cover identity/metadata preservation,
selection, deliberately empty scope, loading restrictions, cancellation and
focus return; two utility tests verify immutable selection behavior. Chrome
desktop verifies Enter opens :modal, Cancel has initial focus, Space toggles a
checkbox, and save/Escape return focus to the trigger. The save used an isolated
fixture only; no actual account namespace scope was changed. The temporary
fixture/server were removed/stopped. Local frontend verification passes 166
tests and the build, with 85 production TS/TSX files covered by LCOV records.
The exact-commit scan and broader mobile/product verification remain pending.

Run 37 verifies `007219052f266c9bf5c5b2d548733cde8f738182`: 125 open
issues, 34.0% coverage, no unreviewed hotspots and standard gate OK. Redaction
and public-status findings are CLOSED. Archive:
`gs://priyanshu-apps-sonarqube-backups/reports/620585d0-a252-446e-a97b-650849f2ad6d-1792758086.json`.

The next backend batch has eight HTTP Keycloak user tests covering search,
status mutation, last-admin protection, missing targets and provider failures.
Repeated search parameters are rejected instead of silently coerced. Avatar
regex cleanup preserves allowed formats, mixed-case base64, rejection limits
and identity-provider protection (five tests). Sensitive-resource classification
normalizes string paths without coercing malformed objects. Backend: 266 tests.

Administration tests reproduced a data-loss bug: the disk config API returns an
array, but the page read only .mounts and would save an empty list. Both current
array and legacy object responses are now supported. Nine frontend tests cover
exact role permissions, user assignment, disk preservation and Keycloak health
precedence. Selection helpers and native output elements reduce rendering
nesting while keeping labels and layout. Permission dependencies (users.manage
versus roles.manage; system.configure versus system.read) are documented for a
narrow policy decision; no access was widened in this batch. The exact-commit
scan is still required, and production remains held.

Run 36 verifies `a24a19b86c9080a36ee2ddf07f76d31f510e99da`: 130 open
issues, 33.3% coverage, no unreviewed hotspots; standard gate ERROR. Storage
follow-ups are CLOSED. Two native-dialog event warnings remain OPEN pending
individual review; `review-candidates.json` records exact IDs and browser/test
evidence, not claimed resolutions. The admin session has expired; source fixes
continue independently. Archive:
`gs://priyanshu-apps-sonarqube-backups/reports/78596aee-a77f-4f5b-b2d9-0b69143e126f-1792757191.json`.

The next batch separates credential-redaction patterns while caching their next
matches, preserving original leftmost priority and bearer prefixes. A fixture
oracle checks 100 overlapping format combinations; a long-input fixture checks
10,000 redactions. Public status bars use time-bin identity instead of index keys,
with four tests for uptime thresholds, 60-bin layout, empty history and filtering.
Local verification passes 252 backend tests, 150 frontend tests and both builds.
Its exact-commit scan is pending; no production image is published.

Run 35 verifies `cb09048c90116cc4ccff2a3630507ecc26ba28b7`: 133 open
issues, 33.1% coverage, zero unreviewed hotspots; standard gate ERROR.
Orb and Kubernetes log-viewer findings are CLOSED. Two new storage findings
(single-child fragment and accessible label text) are fixed in the following
batch rather than ignored. Archive:
`gs://priyanshu-apps-sonarqube-backups/reports/e5665f84-1e21-49cd-8b28-bbb3606de539-1792756729.json`.

The next batch replaces the license modal's simulated dialog with a native
dialog. Two tests read the actual root LICENSE, which is narrowly allowlisted
for Vite by exact file and raw-import ID, not by repository directory. Chrome
desktop verification confirms Enter opens a modal, Close receives initial focus,
Escape and a real outside click dismiss it, and focus returns to License. A
browser-discovered focus-return issue was fixed before publishing. Desktop
layout was visually inspected; mobile and broader product verification remain
pending. The isolated local fixture/server were removed/stopped after testing.
Local frontend suite passes 146 tests and the build; this batch awaits its scan.

Run 34 verifies `2a820f5be0a277885b2a68aebf41bd1d5d5b4287`: 142 open
issues, 32.4% coverage, no unreviewed hotspots; standard gate ERROR.
Six Kubernetes log-viewer findings are CLOSED; residual component complexity is
16 versus the allowed 15 and receives a small plural-label helper in the next
batch. No acceptance or exclusion is used. Archive:
`gs://priyanshu-apps-sonarqube-backups/reports/47404977-c66e-44a4-9f8f-ffc027473577-1792756242.json`.

The following batch preserves all five AI orb states/classnames (six tests) and
storage utilization thresholds. Storage configuration now uses kubiq's shared
toast, with handler-level permission checks. Tests first reproduced the custom
toast and stale Configure-click behavior; five tests now cover threshold colors,
selected-volume saves, revoked open/save permissions and discovery errors.
Local frontend verification passes 144 tests/build, and all 83 production source
files remain in LCOV. The batch still needs its exact-commit verification scan.

Run 33 verifies `dd6d1c1a66a539a665e3bfce363d578b00ec5191`: 148 open
issues, 31.6% coverage, zero unreviewed hotspots and standard gate OK. The
backend configuration/template/import/condition batch is verified closed.
Archive: `gs://priyanshu-apps-sonarqube-backups/reports/820fc407-9ca7-47bb-a58d-df72ccabdc96-1792755903.json`.

The following Kubernetes log-viewer batch extracts stable row, connection badge
and summary-modal renderers. Three interaction tests preserve subscriptions,
container switches, filtering, pause/new-line counts and ended-state rendering.
A test reproduced retained socket listeners on container change; cleanup now
removes them, and a new subscription resets the connection badge. Typed socket
and virtual-list refs replace explicit-any refs. Local verification passes
133 frontend tests and its build; backend source is unchanged from 250 passing
tests. The matching scan remains required; production stays blocked.

Run 32 verifies `05b7d5f213410777088f173852085c4edd1e5188`: 158 open
issues, 31.6% coverage, no unreviewed hotspots and standard gate OK.
Waterfall/inspector findings are CLOSED. The strict zero-issue/verification
requirements still block release. Archive:
`gs://priyanshu-apps-sonarqube-backups/reports/5a6c1763-5300-419c-93c5-ee6d1d42b16a-1792738292.json`.

The next backend batch simplifies import/template/condition/constructor and
existence-check findings without changing the valid string API contract.
Provider/model validation now rejects non-string payloads instead of silently
coercing arrays/objects into configuration strings. A regression test first
reproduced that acceptance bug. Local verification: 250 backend tests, backend
build, and unchanged frontend source with 130 tests/build already passed.
Live lint inspection finds zero errors but 371 backend explicit-any warnings
and 128 frontend warnings (118 explicit-any, 10 hook dependencies). The strict
lint gate remains failed, not disabled. The batch awaits a matching scan.

Run 31 verifies `2b8f31669d3700e43c38b028a7f43faee21247bd`: 165 open
issues, 30.9% coverage and no unreviewed hotspots; standard gate ERROR.
The raw-log watcher findings and topology follow-up are CLOSED. Archive:
`gs://priyanshu-apps-sonarqube-backups/reports/32a7de18-32bb-439a-9191-e910b9ab0ef4-1792737532.json`.

The following trace UI batch adds native waterfall selection/dismissal buttons
and separates duration-position and attribute-rendering branches. Five fixture
tests cover tree ordering/depth, selection, label positioning, attribute values,
error status, dismissal and empty states. Frontend LCOV now includes executable
TS/TSX only, not CSS or declaration files. All 83 production files are verified
present; four CI guard tests reject missing, unexpected or duplicate records.
Local verification passes 130 frontend tests and the frontend build. These edits
await their own scan; production remains blocked.

Run 30 verifies `122a15865eecbf8e469c33cc86bb67bb1e7dee25`: 170 open
issues, 30.3% coverage, zero unreviewed hotspots, standard gate ERROR.
All notification-modal findings are CLOSED. The checkpoint records 682 baseline
closures, 157 pending findings and two safe reviews. One new presentation-role
finding on the topology background is corrected by keeping all interaction
handlers on its native pan button in the next batch. Archive:
`gs://priyanshu-apps-sonarqube-backups/reports/b8619d0e-f9b9-4065-9609-70c7c0930ce8-1792737021.json`.

The raw-log watcher batch adds five lifecycle tests for shared subscriptions,
batched/oversized flushes, truncation, cleanup and late asynchronous work.
The late-stat test failed before the fix. Cleanup now closes active reads, and
late stat/data callbacks cannot restart an unsubscribed stream. Nested append
handling and per-file/per-directory unsubscribe logic are split into methods.
Local verification passes 249 backend tests and 125 frontend tests, with both
builds passing. These edits await their own scan; production remains held.

Run 29 verifies `7d04fb7c00a570067a137787a54681640c8889d6`:
182 open issues, 30.0% combined coverage, zero unreviewed hotspots, standard
gate OK. All 13 diagnosis-modal findings are CLOSED. The checkpoint records
671 explicit baseline closures, 168 pending and two individually safe reviews.
The strict release gate still blocks production. Archive:
`gs://priyanshu-apps-sonarqube-backups/reports/6e25d0ee-20c8-4683-8a1b-b1c89a9ccb13-1792736707.json`.

The following batch extracts the notification channel card, makes flagged
conditionals positive without changing falsy-value behavior, and preserves
permission-denial toast handlers. Three interaction tests check persisted IDs,
saved form values, cancel, denied mutations and kubiq toasts. Topology keyboard
navigation uses a native button separate from node buttons; the regression test
also exercises mouse dragging. These changes await their exact-commit scan.

Latest verified scan (run 28): `6f64ee82c86775ba86a2cd543ce7388293a2a20e`,
analysis `5c196588-ee45-42b1-abe5-83fbef048eb2`, task
`89748692-620d-4557-8011-58480c405d03`. There are 195 open issues,
29.3% combined coverage, and zero unreviewed hotspots. The quality gate is ERROR.
The checkpoint records 658 explicit baseline closures, 181 pending baseline
findings and two individually safe reviews. Production remains blocked.
Archive: `gs://priyanshu-apps-sonarqube-backups/reports/89748692-620d-4557-8011-58480c405d03-1792736319.json`.

The following diagnosis-modal batch fences late responses and license failures
after target changes, close/reopen and unmount. Six tests cover pod/event
compatibility, markdown output, license flow and stale requests. Content-derived
keys and native dismissal controls replace index keys and a click-only backdrop.
These edits await their matching scan; they are not counted as verified closures.

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
| `bff6049` | 18 | `0a89864e-8b9e-4080-bec1-1e990ea91222` | 308 | 23.3% | 0 |
| `996fb43` | 19 | `f0412dd8-f949-4efe-b605-3f1dabe35ded` | 303 | 23.3% | 0 |
| `fde0263` | 20 | `ec7a6591-b356-4b43-945c-1ce1710343b5` | 296 | 23.4% | 0 |
| `9dc1c9c` | 21 | `0cc9c910-19e7-48a8-8e8e-5bbdb3e3ac3e` | 289 | 23.4% | 0 |
| `c090516` | 22 | `f910f2e1-7bab-4ee9-8ecc-5a67511cc1ef` | 281 | 24.0% | 0 |
| `591a311` | 23 | `dcb95e3d-58e5-4a30-9187-4cad39e8ae7a` | 280 | 24.1% | 0 |
| `2322a6c` | 24 | `3e21691d-103e-48b7-be82-a18ec6cdda90` | 275 | 24.1% | 0 |
| `b303271` | 25 | `566e2878-34ba-4edf-919b-1b87d3132f1b` | 252 | 25.9% | 0 |
| `caf4648` | 26 | `1dbab1b7-7dbf-48b9-a297-6cfd9bc7cf2f` | 252 | 25.9% | 0 |
| `fe0d435` | 27 | `cf803e97-cf13-489f-a315-a0c07d61b5e5` | 217 | 27.6% | 0 |

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

Run 22 verifies native service-card details controls without nesting Edit/Delete
buttons, plus investigation, pod-status, service-map and audit-view conditional
cleanup. All 241 backend and 87 frontend tests and both builds passed. The
checkpoint records 573 explicit original closures, 266 pending original
findings and two individual safe reviews. Current open issues total 281. The
matching export is
`gs://priyanshu-apps-sonarqube-backups/reports/65ca222f-755f-4cdb-ac06-7fd6e6e0080e-1792732343.json`.
Standard gate is OK; strict release criteria remain blocked. Remaining findings
in these files are addressed in the following batch and require another scan.

Run 23 confirms the message route is below the cognitive-complexity limit,
with no open findings in `backend/src/routes/kubi.ts`. The extracted helpers
preserve reply persistence before SSE completion, local product answers,
clarification-slot handling, provider error messages and active-user cleanup.
All 244 backend and 87 frontend tests pass, both builds pass, and coverage
reports and exact-commit release-gate regression checks pass. The checkpoint
records 574 explicit original closures, 265 pending originals and two safe
reviews. Its matching export is
`gs://priyanshu-apps-sonarqube-backups/reports/e0371133-829e-4c44-93bc-38213f926d81-1792732529.json`.
The standard gate is OK; the strict release gate rejects the remaining 280
issues. No production image or release proof was published.

Run 24 confirms the remaining five findings in the focused frontend files
closed. There are no open findings in ServiceCard, KubiActivity, AuditLogViewer
or ServiceMap. Native progress output retains the former text styling through
an explicit class; native service-card controls retain independent admin
actions. Existing status, permission-transition, loading, empty and populated
audit tests remain passing. The exact-revision export is
`gs://priyanshu-apps-sonarqube-backups/reports/c4bac73a-d8a6-48c6-b8cb-667095e8f436-1792732736.json`.
Current open issues: 275; unreviewed hotspots: zero; combined coverage: 24.1%.
The standard gate is OK, but the strict release gate remains blocked. Larger
APM/Kubernetes findings, lint warnings, and full browser visual comparisons
remain pending; these results do not establish complete remediation.

Run 25 verifies the first APM rendering split, native controls and presentation
helpers. The 112-complexity page function is removed; new characterization tests
cover loading/error precedence, adapter support, service filtering, trace
auto-selection and returning to overview. Export is now gated by `apm.export`,
while Refresh no longer incorrectly requires export permission. Coverage is
25.9% with 252 open issues and no unreviewed hotspots. Its archive is
`gs://priyanshu-apps-sonarqube-backups/reports/1214eed7-a8c3-49a3-bd6a-0b8380b8f4e0-1792734509.json`.

Run 26 records 606 explicit original closures, 233 pending originals and two
individual safe reviews, plus 64 additional exported findings. Its archive is
`gs://priyanshu-apps-sonarqube-backups/reports/7850207a-e2be-45c2-89d4-216a41f0cc08-1792734869.json`.
The total remains 252 because new findings offset closures. In particular,
S6551 caught a topology-toggle class expression that returned React elements
instead of class strings during further extraction. This revision was held
from production. The next batch corrects it and adds an explicit topology
switching and CSS-class regression test, rather than accepting the finding.
Standard and strict gates remain failed at these checkpoints.

Run 27 confirms the APM topology regression corrected and no remaining open
findings in ApmDashboard, its presentation helpers, K8sDetailPanel or its
presentation helpers. Current issues total 217, coverage is 27.6%, and no
hotspots remain unreviewed. The exact export is
`gs://priyanshu-apps-sonarqube-backups/reports/21e6cd6a-2fe9-41b1-9395-ff17d6f38031-1792735770.json`.
The checkpoint records 635 explicit original closures, 204 pending originals
and two safe reviews, plus 65 additional exported findings. One new nesting
finding in the polling hook is fixed in the next batch and not hidden.

The Kubernetes lifecycle regression test first reproduced three history calls
after unmount when delayed configuration resolved. The fixed hook no longer
starts timers or applies stale responses after cleanup. Tests also verify
stale YAML rejection, configuration-failure fallback, terminal removal after
exec-permission revocation, and container expansion retained across reordering.
All 244 backend and 110 frontend tests and both builds passed for this revision.
Both standard and strict gates remain failed; no production image was published.

Run 18 verifies the ordered kubi evidence-collector extraction and conditional
cleanup. Its checkpoint records 545 explicit baseline closures, 294 pending
baseline findings and two individual safe reviews, plus 50 additional findings.
The exact-revision export is
`gs://priyanshu-apps-sonarqube-backups/reports/3d6903ab-11ac-4172-9b89-751b5b46fd66-1792695593.json`.
All 229 backend and 77 frontend tests and both builds passed. Trace-correlated
log retrieval now independently requires `logs.read`, with a denial regression
test. The standard quality gate is ERROR; production remains held. A new
misleading-indentation finding in the extracted APM collector is tracked and
fixed in the next batch rather than accepted or excluded.

Run 19 verifies all 12 global string-replacement findings closed. Seven new
raw-literal modernization findings were reported by the analyzer; these are
fixed in the following batch, not excluded. The checkpoint records 557 explicit
baseline closures, 282 pending baseline findings, two safe reviews, and 57
additional findings. Its export is
`gs://priyanshu-apps-sonarqube-backups/reports/54ab1041-a712-4c33-8f03-bb5a6f0f616f-1792695843.json`.

Verification for `fde0263` includes 241 backend tests, 77 frontend tests, both
builds, three exact-commit release-gate tests, and three tests each for the Node
and Python APM exporters. Both LCOV files were generated successfully. Backend
lint reports zero errors and 370 warnings; frontend lint reports zero errors
and 136 warnings and fails its zero-warning policy. These warnings remain
work to complete; passing unit tests must not be mistaken for a clean CI gate.

Run 20 confirms the raw-literal, APM guard, and SSL branch fixes: 565 original
findings are explicitly CLOSED, 274 remain pending, and two are individually
reviewed safe. There are 59 additional exported findings (including closed
items). Current open issues total 296. Its archive is
`gs://priyanshu-apps-sonarqube-backups/reports/cd5700de-2c59-44bc-95e5-dd2cc09f2f55-1792696060.json`.
Seven literal-pattern follow-ups in CSV/XML escaping are addressed in the next
batch; their closure is not inferred until a matching scan completes.

Run 21 confirms all seven literal-pattern follow-ups closed, with no open
S7780 or S7781 findings. The standard Sonar gate is OK, but the strict release
criteria remain failed because 289 open issues remain. Coverage is 23.4%, and
there are no unreviewed hotspots. The matching export is
`gs://priyanshu-apps-sonarqube-backups/reports/ff1c4455-e86b-416c-a924-5ad7fb021b59-1792696392.json`.
No production image or release proof was published. The next batches still
include frontend accessibility, nested conditionals, complexity and lint
warnings; this is verified progress, not completion of the full plan.
