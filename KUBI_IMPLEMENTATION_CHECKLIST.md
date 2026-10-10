# kubi implementation checklist

This checklist is updated only after an item is implemented and verified.

## Foundation and Pro enforcement

- [x] Add kubi feature configuration and runtime limits. Verified by the local production-equivalent backend runtime.
- [x] Add a shared server-side kubiq Pro gate for every `/api/kubi` conversation endpoint. Verified by middleware tests and the local production-equivalent backend.
- [x] Add a shared AI-provider service for Gemini, OpenAI, and Anthropic. Verified with provider response and fail-closed tests.

## Conversation data and API

- [x] Add kubi conversation repositories for MongoDB, MySQL/MariaDB, and JSON. Verified with adapter tests and the backend type build.
- [x] Enforce per-user 90-day history, delete-one, and clear-history behavior. Verified in isolated repository lifecycle tests.
- [x] Add authenticated streamed `/api/kubi` conversation endpoints. Verified by the SSE route test, access-gate tests, and the backend type build.

## Read-only telemetry tools and privacy

- [x] Add the strict kubi tool allowlist for services, logs, APM, Kubernetes, system, notification history, and audit history. Verified by evidence-collector tests.
- [x] Add bounded Kubernetes pod-log investigation with namespace/RBAC enforcement. Verified by isolated-reader evidence tests and Kubernetes manifest validation.
- [x] Add slow-database-span lookup without scraping CSV export. Verified by evidence-collector tests.
- [x] Add redaction, SQL administrator boundary, tool limits, and audit metadata. Verified by redaction and tool-limit tests.

## kubi user experience

- [x] Add global Pro-only Ask kubi panel/drawer, streaming states, evidence cards, and conversation history. Verified in an authenticated local kubiq Pro session.
- [x] Verify desktop, mobile, keyboard, and reduced-motion behavior. Verified at a 390px mobile breakpoint, with Escape/focus return; reduced-motion disables drawer movement and the spinner animation.
- [x] Design original kubi avatar and seven states in Figma (Priyanshu Modi's team): https://www.figma.com/design/qt2arRo6RMK6zHnYEAkk5Q?node-id=2-2 . Verified rendered state sheet.
- [x] Implement procedural Canvas avatar, protocol-based thinking/searching/working/composing/finished/error states, reduced motion, offscreen/tab pause, and cleanup. Verified 16 frontend tests, frontend build/typecheck, targeted avatar/panel lint, backend type build, and six route/evidence tests including real stage ordering. Desktop avatar rendered in Chrome. No new dependencies.
- [ ] Complete final authenticated mobile/live-answer acceptance across all avatar states. The earlier local runtime/authentication blocker is resolved; the current remaining live follow-up test hit Gemini provider HTTP 429. Do not treat this as fully accepted until rechecked.

## Verification and delivery

### Release preparation — 2026-10-11

- [x] Replace the incorrectly projected reader token (which inherited the main pod identity) with short-lived TokenRequest credentials for `kubi-readonly`, named namespace-scoped token-request permission, refresh-before-expiry and fail-closed handling. Unit tests verify caching, concurrent requests, rotation and sanitized failure. Live RBAC acceptance remains pending.
- [x] Add Docker context exclusions for local environment files, Gemini key, dependencies, generated builds and design previews.
- [x] Run complete backend suite (71 tests), frontend suite (19 tests), backend TypeScript build, frontend production build, backend ncc packaging and manifest YAML parsing. Existing Browserslist age and large frontend chunk warnings remain.
- [x] Verify real Kubernetes inventory and pod logs through a freshly minted `kubi-readonly` token, plus reader write/exec denial. In production, token issuance returned `201`, namespace and pod-log reads returned `200`, while deployment patching returned `403`; pod is Ready on `priyanshumodi22/kubiq:main-51`. Refresh behavior remains covered by unit tests rather than a one-hour production wait.
- [x] Publish/release the feature and verify rollout. GitHub workflow succeeded, Flux reconciled `main-51`, and deployment generation 49 is observed and Ready. Feature implementation remains on `kubi`; Flux committed the generated image tag to `main`.

### Clarification and audit conversations — 2026-10-11

- [x] Add validated model-based intent planning before evidence retrieval, bounded conversation context, clickable persisted clarification choices, and typed replies. Clear read questions route to selected domains; ambiguous questions ask for missing details. New Mongo message fields are covered by schema-casting tests; JSON/MySQL preserve message JSON.
- [x] Add explicit pending username/namespace fields so short identifiers such as `read` are accepted without repetitive clarification. Tested in Chrome: question -> specific-user choice -> username -> actor/timestamp/namespace records.
- [x] Keep audit access administrator-only in both planning validation and the evidence collector, including own-account audit requests. Verified with tests and a real Gemini viewer-plan evaluation. An unrelated coding request was also refused in a real provider evaluation.
- [x] Filter role/namespace audit records by action and affected account before limiting, across MongoDB, MySQL and JSON. Evidence states retained-history coverage and truncation; audit links use `/audit-logs`. Mongo query construction and live Mongo history verified; other adapters type-checked.
- [x] Verify backend build, frontend typecheck/panel lint, clarification persistence, audit routing, access denial and invalid-plan fallback tests. Existing backend `any` lint warnings remain; touched-file lint errors were corrected.
- [x] Add a specific provider-rate/quota error response after confirming a real HTTP 429 during the live follow-up. Verified by route test; no provider response body is exposed.
- [x] Verify persisted clarification choices after reopening history and at a 390px mobile viewport: choices are enabled for the pending question and fit without horizontal overflow. Typed username and button paths were exercised in Chrome. Restored desktop viewport afterward.
- [ ] Re-run live account-context follow-up after Gemini quota/rate capacity is available. The previous account-specific answer succeeded, but the follow-up failed upstream; do not mark it passed.
- [x] Verify live Kubernetes inventory/pod logs with a working isolated-reader cluster connection. Production checks used the dedicated account token and completed successfully; local Kubernetes access remains unavailable.

### Documentation and chat polish — 2026-10-10

- [x] Add bounded retrieval from seven allowlisted official kubiq documentation pages, with one-hour caching, source anchors, preserved table boundaries, and explicit unavailable/no-match responses. No arbitrary URL fetches or transmission of user questions to the docs host.
- [x] Separate documentation from telemetry collection and exclude previous private conversation content from documentation provider requests. Verified by automated evidence tests and an authenticated Chrome authentication-docs question with one relevant source.
- [x] Handle greetings, short incomplete input, identity and creator questions locally; retain unrelated coding refusals. Verified in Chrome with hello, creator and palindrome requests, and automated scope cases. Local replies no longer show evidence labels or a fictitious investigation trail.
- [x] Replace launcher pill with robot plus Ask kubi thought bubble, using the Figma launcher reference and avatar guide. Match the navbar-style Pro badge, remove the welcome orbit, and reduce desktop history confirmation buttons to 32px while retaining coarse-pointer touch height.
- [x] Verify panel in Chrome at desktop and a mobile viewport without horizontal panel overflow; verify history Cancel without deleting conversations. Backend build, frontend production build and 32 focused backend tests pass. Targeted frontend/new backend lint has no code findings; existing ESLint legacy-config, Browserslist age and large-bundle warnings remain.
- [ ] Commit/push/deploy these changes only after user approval. Local frontend and backend remain running; production is unchanged.

### Robot redesign review — 2026-10-10

- [x] Replace the cloud exploration with the user-approved blue robot, dark visor and expressive signal fins. Seven procedural states visually checked in Chrome using the explicit development preview.
- [x] Implement the redesigned panel and persistent actual-event investigation trail. TypeScript, production build, 19 avatar/stream/progress tests and targeted ESLint pass. No new runtime dependencies.
- [x] Start local frontend (5173) and backend (3001) using approved read-only k3s configuration retrieval, with secrets kept in process memory and localhost routing overrides. Verified HTTP 200, healthy backend, native auth enabled, existing authenticated Chrome session and actual redesigned panel opening.
- [ ] Finish live follow-up streaming acceptance. Desktop/mobile clarification, history persistence and the account-specific streamed answer are verified; the subsequent live follow-up is currently limited by provider HTTP 429.
- [ ] Resolve broader existing design-audit findings separately. Strict audit reports native form/scrollbar ownership issues outside this redesign; no global compliance claim.

### kubi product-only scope — 2026-10-10

- [x] Enforce kubiq-only scope before evidence collection. Replaced the restrictive keyword gate with bounded, validated intent planning for nontrivial requests; this planning call uses the AI provider and request allowance. Greetings/known product facts stay local. Unrelated coding requests are refused, with automated and live-provider verification.


- [x] Add backend and frontend automated tests. Verified: 29 backend tests and 1 frontend SSE client test pass.
- [x] Update CI to run tests before image build/Flux delivery. Verified by parsing the production workflow test gates.
- [x] Start local kubiq frontend/backend with production-equivalent k3s configuration and verify end-to-end behavior. Verified with an authenticated kubiq Pro session: availability gate, Gemini streaming answers, bounded service/log evidence, evidence links, persisted history, mobile layout, and Escape/focus return.
- [ ] Verify production deployment only after explicit user approval.
