# Trace-log correlation verification — 2026-10-29

## Released result

Application source: `aaa473a8fa7afc7b31ab8732e1804123d8773b74`.
Flux image update: `410b91d6e64e6bc6c0dff46f704a8a851e90eb30`.
Production image: `priyanshumodi22/kubiq:main-193`; prior rollback image: `main-188`.

- [Successful exact-commit Sonar scan](https://github.com/priyanshumodi22/kubiq/actions/runs/40779160399): strict release criteria passed; report exported. No open/confirmed issues or unreviewed hotspots. The fixed new-code coverage gate remains at 80%.
- [Successful production image workflow](https://github.com/priyanshumodi22/kubiq/actions/runs/40779648078): 495 backend and 397 frontend tests, lint/builds, Node 20/22 packaged SDK compatibility, actual authenticated MongoDB image test, and MongoDB/MySQL/MariaDB/ClickHouse retention/compatibility fixtures passed. The publish job was rerun after the scan/export completed; no gate was bypassed.
- The real image verifies exactly one safe request-completion event per eligible request, matching SERVER trace/span IDs, successful retained correlation lookup, unauthenticated denial, idle/no-feedback behavior, bounded shutdown and synthetic-secret non-disclosure. The real MongoDB/ClickHouse fixtures exclude near-match IDs and sources outside the supplied scope.
- A production-image test caught an OpenTelemetry API-version mismatch before publication. The API is now external to ncc alongside the SDK runtime, with matching pinned backend/telemetry versions. A CI dependency-contract test prevents that mismatch from recurring. No SDK package release was needed.

## Live Chrome and MongoDB evidence

The signed-in administrator searched real trace `a76ffd3880e0cc1825e757f875e0bda1` in APM and clicked **View Trace Logs**. A new Logs tab opened automatically with all permitted retained sources and one matching event, without selecting or starting a source stream.

Actual SERVER span and log agree on span ID `12bcbe1429850773`, service `kubiq-backend`, and normalized route `GET /kubiq-api/api/services/status`. The HTTP status was 304, span duration 10.53 ms, and completion-log duration 10.51 ms. This was real application traffic, not a fabricated historical log or a disposable error endpoint.

Selecting the existing saved `kubiq` Kubernetes source narrowed the retained search. Resetting to all permitted sources restored the request-completion event. The saved source was preserved.

The original legacy link `/logs?search=cb4dd69ad294012869960ce0f9f53285` also opens automatic correlation search. It reports zero matches and **No correlated logs retained**. Production had five spans for that trace but no corresponding recorded log; logs cannot be recreated retroactively.

After live lookups, MongoDB contained zero completion logs and zero SERVER spans for `/api/logs/trace/`. Browser inspection found no native JavaScript dialog. Error handling uses kubiq toasts and inline errors; source/namespace access remains enforced by the server. Fault/denial cases were tested in isolated fixtures rather than disrupting production dependencies.

## Health and initial storage observations

- New kubiq pod: Ready, zero restarts, approximately 117 MiB and 11m CPU in the initial sample; existing 512 MiB limit unchanged.
- Disposable production-image peaks: 116,977,664 bytes with tracing disabled and 119,738,368 bytes enabled (about 111.6/114.2 MiB), with no OOM or restart.
- kubiq health 200; unauthenticated ingestion and analytics 401. Portfolio health, activity endpoint and SSE all 200, with activity events available.
- All five Flux Kustomizations Ready after rollout. MongoDB authentication, application secrets, portfolio deployment, VM sizing, APM retention and existing log-source configuration were preserved.
- Initial production sample: 130 completion records / 68,318 logical BSON bytes, averaging about 526 bytes per event, collected over approximately 182 seconds while browser dashboards and verification traffic were active. At that short-window pace, seven days would be approximately 216 MiB of logical completion documents **before indexes and allocator overhead**. This is a scenario estimate, not a representative daily forecast or an overall-storage guarantee.
- Allocated log data/index storage in that sample: 172,032 / 815,104 bytes. Existing APM data/index allocation: 5,316,608 / 8,159,232 bytes. The log TTL remains 604,800 seconds (seven days); APM retention remains three days. No sampling, retention reduction, index removal or resource resizing was introduced.
- A full 24-hour growth/index measurement remains unobserved. Short-window document rates must not be presented as a completed capacity check.

## Operational behavior

New eligible kubiq requests persist privacy-limited completion events through the existing bounded ingestion buffer; no log viewer needs to be connected. Other applications still need their own correlated log emission/collection. Kubernetes streaming remains viewer-connected. Older traces may legitimately have no matching logs.

The correlation API searches a trace-derived window with a one-minute margin, capped at 500 results; an unavailable/deleted trace uses an explicitly displayed seven-day fallback. MongoDB and ClickHouse support retained search. Unsupported storage and unavailable databases are distinct errors, not empty successful results. See [log-source documentation](kubernetes-log-sources.md).

Rollback uses the prior application image through GitOps; it does not require changing databases, secrets or deleting retained logs. Existing SonarQube on-demand/idle-shutdown behavior remains unchanged.
