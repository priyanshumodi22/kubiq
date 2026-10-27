# Database detail and application dialog verification — 27 October 2026

Application release source: `a3ef31b01beb427a4fb95f86c67343051b75c5c5`.
Published SDK: `kubiq-apm@1.1.1`; Python is unchanged.
Production image: `priyanshumodi22/kubiq:main-177`, digest
`sha256:284af5ad7680ff775ac3c645a3ace695e09867ae4a1f02bdb9d256ecc182eaab`.
GitOps enables `KUBIQ_TRACING_QUERY_DETAILS=true` in the Deployment pod template.

## Verification evidence

- Backend: 435 tests across 78 suites, TypeScript build and lint with zero errors.
- Frontend: 359 tests across 67 files, lint and production build.
- Packaged SDK: Node 20 and 22 CommonJS/ESM checks.
- [Exact-commit Sonar scan](https://github.com/priyanshumodi22/kubiq/actions/runs/40535525095): passed strict release criteria; report preserved in Sheets and the archive.
- [Real database fixtures](https://github.com/priyanshumodi22/kubiq/actions/runs/40535506485): MongoDB, MySQL and MariaDB HTTP request, repository and actual driver command spans, target facts, query details and parent relationships. All four storage adapters also passed metric/attribute/retention regression checks.
- [Release and production-image verification](https://github.com/priyanshumodi22/kubiq/actions/runs/40536311258): passed. Disposable authenticated MongoDB, native authentication, RBAC denial, producer disabled/enabled, command/result metadata, password and password-hash redaction, request metrics, TTL, idle/no-feedback behavior and bounded shutdown.
- Image-test peak memory: 115,761,152 bytes disabled and 102,813,696 bytes enabled. These short fixtures are compatibility checks, not a claim that tracing reduces memory.
- The deployed website documentation and environment preview expose SDK 1.1.1 and the query-detail flag, with matching canonical guide hash `9672f18bac1d43064930af1205bd8a723c50f3de1786b878e5a429a6cdfc78ac`.

At 16:07 UTC, the new production pod was ready with zero restarts, 92,288 KiB working memory and 120,590,336-byte startup peak, under its unchanged 512 MiB limit. Portfolio remained ready under 128 MiB; MongoDB remained ready under 768 MiB. The VM had approximately 1.44 GiB available memory and 13.94 GiB free disk. Existing APM documents and indexes occupied approximately 1.33 MiB; TTL remained 259,200 seconds.

The website build passed. Its repository-wide lint still reports pre-existing errors in unrelated components; this documentation-only change does not claim to clear that separate backlog.

## Capture boundaries

New command spans contain bounded non-credential query values. Passwords, tokens, keys and other credentials are redacted. Credential SQL, stored procedures, opaque configuration writes and unstructured payload fields can be masked in full. Query capture is capped at 4 KiB, with a visible truncation marker. Result documents, HTTP bodies, headers and URL queries are not captured. Old spans cannot be backfilled with data never recorded.

The grouping resembles call-detail exploration, not full Instana feature parity. Own duration is overlap-aware wall-clock time from the loaded trace, not CPU time or a database execution plan. MongoDB is the live production database; MySQL/MariaDB command capture is verified against actual disposable database servers.

## Authenticated production verification — 28 October IST

The renewed Chrome session verified delete-user and delete-role confirmations use kubiq's styled dialog. Cancel and Escape preserved the existing users/roles and restored focus to the trigger. The password-reset prompt uses a password-type field and was cancelled without entering or changing credentials. A future custom APM time produced the existing kubiq warning toast, without a browser alert; the normal Last hour window was restored.

Real trace `027c9e9b8494844e2a016f5984bb1254` contains the HTTP users-directory request, repository children and actual MongoDB command children. Selecting its final `mongodb.find` in Chrome displayed database `kubiq`, collection `users`, the actual server/port, three returned rows, the command document, start/end time and parent `mongodb.users.getAllUsers`. Independent MongoDB inspection verified the recorded command, counts and parent IDs. No users, roles or passwords were changed for these checks. The inspected panel was left open.

The first detailed-capture resource review found 125 MongoDB command spans in the most recent 500 kubiq spans. The collection held 2,058 documents, 964,652 logical data bytes and 720,896 index bytes. The last observed hour contained 226 spans and 137,195 document bytes. Projecting that hour across 72 hours with the current per-document index allocation and doubling for headroom gives 31,155,905 bytes (approximately 29.7 MiB), below the 512 MiB budget. This is an initial traffic-dependent projection, not a byte quota or a full-day measurement. Application, portfolio and MongoDB pods remained ready with zero restarts; limits and three-day TTL were unchanged.

After UI traffic stopped and queues drained, two idle samples held the same 546 SERVER spans and 938 CLIENT spans for kubiq-backend. The APM polling page remained open, confirming that this polling did not create a tracing feedback loop. Public health and unauthenticated ingestion/analytics checks still returned 200/401/401; portfolio activity and SSE checks returned 200, and all five Flux Kustomizations were ready.

The original read-only verification query incorrectly treated literal dotted attribute names as nested MongoDB paths. The private inspection helper now reads those literal keys correctly; the actual stored command spans were already present. No application change was needed for that verification-helper correction.

## Pending observations

The full 24-hour observation of detailed capture remains pending; only about four hours of that mode had elapsed at this review. It must be reported separately from the initial projection.

Rollback disables `KUBIQ_TRACING_QUERY_DETAILS` through GitOps or restores image `main-169`. It must not switch databases, disable ingestion or remove existing traces.
