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

## Pending observations

Final authenticated Chrome dialog and new-command-panel checks require the renewed kubiq login. An initial production projection after representative detailed requests and a full 24-hour capacity observation remain separate from the startup snapshot.

Rollback disables `KUBIQ_TRACING_QUERY_DETAILS` through GitOps or restores image `main-169`. It must not switch databases, disable ingestion or remove existing traces.
