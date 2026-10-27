# Controlled production APM

The permanent identities are `kubiq-backend` and `portfolio`. These profiles use `kubiq-apm@1.1.0/runtime`, not the generic `kubiq-apm/auto` preload. Do not combine providers. Generic auto-instrumentation remains available for other applications through the shared instrumentation guide.

The backend preloads a separate compiled bootstrap before its ncc bundle. The SDK stays external to that bundle. Explicit repository wrappers preserve each MongoDB repository's owning `this`, return values and errors. Native outgoing HTTP calls use request-scoped instrumentation. The portfolio initializes the same runtime before its ESM server and explicitly wraps GitHub fetch operations.

`KUBIQ_TRACING_ENABLED` defaults to `false` and independently controls these producers. `APM_ENABLED` controls kubiq's receiver/analytics; disabling tracing must leave those features available. The runtimes were initially deployed with tracing disabled, then enabled in order after image verification. Production tracing settings now live in each Deployment's explicit container `env`, so a GitOps flag change restarts that producer.

| Service | Private receiver | Credential |
|---|---|---|
| kubiq-backend | `http://127.0.0.1:3001/kubiq-api/api/apm/v1/traces` | Existing kubiq runtime ingestion token |
| portfolio | `http://kubiq.kubiq-system.svc.cluster.local/kubiq-api/api/apm/v1/traces` | `apps/portfolio-apm`, containing only `KUBIQ_INGESTION_TOKEN` |

Keep these values server-side. Never use a `VITE_*` setting for a credential. Adjust the full receiver path if changing the deployment's port/context path. The portfolio does not receive database credentials or application signing/encryption keys.

The controlled runtime explicitly uses W3C TraceContext and AlwaysOn sampling, accepting only the incoming `traceparent` header. It does not enable Jaeger or baggage propagation, even if legacy OpenTelemetry environment settings request them. The image fixture checks malformed Jaeger and credential-bearing baggage headers. The preserved legacy auto-instrumentation dependency tree still has npm audit advisories; in particular, [GHSA-45rx-2jwx-cxfr](https://github.com/advisories/GHSA-45rx-2jwx-cxfr) affects an active Jaeger propagator, which these controlled profiles do not register. A passing Sonar gate is not a clean dependency-audit claim for the legacy auto entry point.

Every eligible request is traced; no rate sampling is applied. Probes/readiness, assets, SSE (including kubi's message endpoint), Socket.IO, telemetry ingestion, APM analytics polling, and portfolio activity-sync POSTs are excluded. Dependency spans require a live eligible request scope; timers inherited from a completed request cannot start further spans. Export, ingestion persistence and retention sweeps run outside request tracing.

Queue capacity is 1,024 spans including the in-flight batch, batch size 50, scheduled flush two seconds and export timeout five seconds. Export failures and overflow produce bounded count-only diagnostics and cannot fail a business request. Spans retain normalized routes, methods, statuses, durations and operation names. Bodies, queries, cookies, authentication headers, database statements and exception messages are omitted.

Shutdown stops business traffic and streams, drains existing ingestion, shuts down tracing, drains the final loopback batch and then closes the listener. A total five-second deadline bounds the operation. The portfolio closes its listener/streams before shutting down its producer. The application owns signals; the opt-in SDK never exits the process.

Metrics use SERVER spans whenever the selected service/time window contains them. Counts, error rate and latency then describe requests, with `measurementBasis: server-requests`. MongoDB, MySQL/MariaDB and ClickHouse apply this selection. SERVER P95 uses the exact upper quantile; services without SERVER spans preserve their previous span-based results and expose `measurementBasis: legacy-spans`. The UI identifies that fallback. Historical IDs and spans are not rewritten; the JSON adapter remains unsupported for APM.

Retention stays `APM_RETENTION_PERIOD=3d`; MongoDB's TTL deletion is asynchronous. Existing log retention and authentication remain unchanged. Keep the VM and CPU limits unchanged. Test portfolio at 128 MiB first; only measured headroom may justify raising it, up to 192 MiB. kubiq remains at 512 MiB.

Before enabling each service, verify the exact image with tracing off/on, real requests, parent relationships, idle stability, failure behavior and shutdown. Capture startup/traffic/idle memory and confirm no OOM kills or restart loops. Project three-day span data plus index growth against 512 MiB, separating test traffic from the initial usage estimate. If the projection fails, stop the rollout and report it; do not silently sample, shorten retention or resize the VM. Record the first complete 24-hour usage check separately; an initial projection is not that observation.

Enable and verify kubiq first, then portfolio, through their GitOps manifests. Retain `priyanshumodi22/kubiq:main-157` and `ghcr.io/priyanshumodi22/portfolio:main-4` as the pre-instrumentation application images. Rollback either sets `KUBIQ_TRACING_ENABLED=false` through Git or restores the prior image. It must not switch databases, disable the receiver or delete existing traces.

CDN cache hits and client-side navigation do not reach these servers and are outside this server-tracing coverage. Browser performance monitoring is not enabled.

See [27 October production verification](production-verification-20261027.md) for exact release evidence, real traces, the initial capacity projection and the pending full-day review.
