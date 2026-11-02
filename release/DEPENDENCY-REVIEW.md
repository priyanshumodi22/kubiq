# Production dependency review â€” 2026-11-02

Scope: the kubiq application launched by its Docker image and Linux bundle. This assessment
does **not** approve publishing the legacy `kubiq-apm` SDK or preloading `kubiq-apm/auto`.
Development dependency advisories are outside the production audit totals below.

The image stages and application CI jobs now use Node 22 to match the tested Linux bundles.
The [official Node release table](https://nodejs.org/en/about/previous-releases) marks Node 20
end-of-life. The SDK's explicit Node 20 compatibility matrix is retained as a legacy-library
compatibility check; it does not select the application's production runtime.

## Findings and disposition

| Advisory | Disposition | Evidence |
| --- | --- | --- |
| [Glob cancellation bypass](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) | Patched: glob 14.0.3 | Actual LogStreamService glob/Path matching, file ordering and limit checked on disposable files |
| [Minimatch globparts amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249) | Patched: upgraded glob resolves minimatch 11.0.2 | Production audit no longer reports the advisory |
| [UUID supplied-buffer bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Patched: uuid 11.1.1 override in backend and tracing | CommonJS SDK initialization, real trace export, backend tests and application smoke checks |
| [Selector-parser quadratic parsing](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | Patched: postcss-selector-parser 6.1.5 | Frontend tests, lint and production build |
| [OpenTelemetry baggage allocation](https://github.com/advisories/GHSA-8988-4f7v-96qf) | Not reachable in the assessed application configuration | Runtime registers W3CTraceContextPropagator only; request extraction passes only traceparent; a throwing baggage getter is never read |
| [Database auto-instrumentation db.user exposure](https://github.com/advisories/GHSA-qqmp-wf37-98f9) | Affected automatic instrumentations not loaded by the assessed runtime | Only HTTP transport instrumentation registered; installed-module cache and real exported fixture spans checked |

Database usernames intentionally supplied by kubiq's own detailed tracing are governed by its existing
policy. This assessment does not claim that every `db.user` attribute is forbidden, or that legacy SDK
auto-instrumentation is fixed. The unchanged API/SDK family avoids a forced OpenTelemetry 1-to-2 migration.

## Audit results and enforceable scope

- Frontend production dependency graph: **0 findings** (previously 2 moderate).
- Backend: **42 moderate graph findings, 2 unique advisories**, no high/critical (previously 46 moderate).
- Tracing: **42 moderate graph findings, the same 2 unique advisories**, no high/critical (previously 44 moderate).
- Dependency-chain repeats are retained in the output; they are not reported as patched or suppressed.

`release/dependency-assessment.json` limits the assessment to the exact known advisory/package pairs,
backend/tracing roots and SDK version 1.1.1. It expires **2026-12-02**. No frontend finding is accepted.
`scripts/check-production-dependencies.cjs` rejects unavailable/incomplete audits, unknown advisory chains,
unreviewed findings, elevated severity, changed scope/version and expired assessments. Existing high/critical
gates remain in place. Four policy tests prove those rejection paths and the assessed launcher entry points.

`ops/apm-production/dependency-boundary-check.cjs` runs against both installed SDK copies. A synthetic
request has valid traceparent but throwing getters for baggage, tracestate, authorization and Jaeger headers.
It verifies no baggage context, exact propagation fields, absence of DB auto-instrumentation imports, and
correctly parented exported spans. CI runs these checks; Linux bundle jobs repeat them using Node 22.

Reopen this assessment if the launcher/bootstrap, SDK version, registered propagators or instrumentations
change. A future SDK/auto-instrumentation release requires migration or its own independent assessment.

## Local verification

- Frontend: 413 tests passed; lint and production build passed.
- Backend: 512 tests passed; build and existing lint checks passed (existing warnings remain).
- Real glob integration and both installed-runtime boundary checks passed.
- Four policy tests and the existing package/release-gate suite passed.
- Updated AMD64/ARM64 bundle smoke evidence is recorded with the local validation results.

Package references: [glob](https://npmscan.com/package/glob),
[uuid](https://npmscan.com/package/uuid),
[postcss-selector-parser](https://npmscan.com/package/postcss-selector-parser).

## Remaining flagged package references

NPMScan enrichment classified the eight direct advisory/package entries as monitor and found no
KEV-listed entry. This prioritization is supporting context, not a replacement for the runtime evidence.
The 42 graph findings per backend/tracing tree are repeated dependency chains of these entries:

- [OpenTelemetry core](https://npmscan.com/package/%40opentelemetry%2Fcore)
- [Cassandra instrumentation](https://npmscan.com/package/%40opentelemetry%2Finstrumentation-cassandra-driver)
- [Knex instrumentation](https://npmscan.com/package/%40opentelemetry%2Finstrumentation-knex)
- [Mongoose instrumentation](https://npmscan.com/package/%40opentelemetry%2Finstrumentation-mongoose)
- [MySQL instrumentation](https://npmscan.com/package/%40opentelemetry%2Finstrumentation-mysql)
- [MySQL2 instrumentation](https://npmscan.com/package/%40opentelemetry%2Finstrumentation-mysql2)
- [PostgreSQL instrumentation](https://npmscan.com/package/%40opentelemetry%2Finstrumentation-pg)
- [Tedious instrumentation](https://npmscan.com/package/%40opentelemetry%2Finstrumentation-tedious)

The selected glob, UUID and selector-parser versions had no reported provenance/source mismatch.
