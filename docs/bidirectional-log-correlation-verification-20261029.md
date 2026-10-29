# Bidirectional log/span correlation verification — 2026-10-29

## Released application

- Source: `bcaa6db62573c3d702d401eed63130dec09aa40b`.
- Production image: `priyanshumodi22/kubiq:main-195`; previous rollback image: `main-193`.
- Flux image commit: `facc6ba395329683010280eed68f9dc0c88d44ab`.
- [Exact-commit Sonar workflow](https://github.com/priyanshumodi22/kubiq/actions/runs/40784362582): successful, including strict issue/hotspot/coverage criteria and durable report export.
- [Production verification and publishing](https://github.com/priyanshumodi22/kubiq/actions/runs/40827975432): successful. 500 backend tests and 404 frontend tests; lint/builds; packaged SDK Node 20/22 checks; four-database compatibility; real compiled logger/SDK context check; actual bundled production image with authenticated MongoDB. Publishing retained both exact-commit approval checks.

## Actual production round trip in Chrome

The existing saved Kubernetes source **kubiq** (`kubiq-system`, Deployment `kubiq`, all containers) was preserved and selected in Logs. The viewer displayed actual container stdout JSON containing:

- Event: `http_request_completed`, HTTP 200, `GET /kubiq-api/api/services/status`.
- Trace ID: `cc4e8a91530498bff1ff04dd771779ab`.
- Span ID: `44317137c0ae51f2`.
- Event ID: `8ace605f-4188-41cc-93e7-92317a7c6991`.
- Event timestamp: `2026-10-29T06:21:02.420Z` (11:51:02 IST).

**View span** was clicked on that streamed row. The new APM tab loaded the trace from its URL automatically, selected the exact SERVER span, and opened its details. Its IDs and HTTP route/status matched the log. Actual span duration was 34.71 ms; completion log duration was 34.46 ms.

**View Span Logs** was then clicked in the span details. Logs opened with both IDs in the URL, searched automatically across permitted retained sources, and returned the original completion event. The result also exposed **View trace** and **View span**, completing the reverse navigation. This was real kubiq traffic, not a fabricated log derived from span attributes or a permanent error endpoint.

## Retained source search and mirrored-event verification

A later event was captured while the Kubernetes viewer was connected:

- Trace: `a2fcad5f84fc62183b3cdc3aeff770a0`.
- Span: `273ef5712a0a3297`.
- Event: `cf3b3f0d-f673-4550-95eb-1d22e7a8cebe`.
- Original event time: `2026-10-29T06:26:51.616Z` (11:56:51 IST).

Ordinary retained Kubernetes-source search found that event and exposed both reverse links. MongoDB independently confirmed a direct `kubiq-backend/http-requests` copy and a source-specific Kubernetes copy with the same trace ID, span ID, event ID and original timestamp. Cross-source exact-span search displayed **one matching log**, collapsing the mirrored event by its event ID.

Initial Kubernetes tail previews predating the viewer connection are not backfilled into that source's retained history under the existing collection policy. The earlier round-trip event remained available through kubiq's direct retained path. This release does not silently turn viewer-connected sources into always-on collectors.

## Semantics, privacy and access

- kubiq's controlled request-completion, audit-action and request-error events use a structured correlated logger. The same event is emitted to stdout and the bounded retained-log buffer. Eligible request diagnostics no longer also emit a duplicate uncorrelated Morgan request line.
- Application events inherit the actual active span; the real SDK fixture verified a child-span event and a SERVER completion event. Delayed background work emits no stale request IDs. Arbitrary third-party console messages are not globally intercepted or assigned invented IDs.
- Streamed VM/Kubernetes rows and both retained-log views share the correlation-link renderer. Actual deployment verification used the saved Kubernetes source; VM renderer/subscription behavior was covered by isolated tests, not a claimed production VM-log source.
- Incoming links preserve the router basename. Span-specific search matches both IDs and can expand to the whole trace. A span with no recorded logs returns an honest empty result; an absent span is not replaced by another selection. Request IDs are not guessed to be trace IDs.
- Structured/prefixed JSON and validated named legacy fields are supported. MongoDB/ClickHouse retain span/event IDs through additive migration; real fixtures verify exact span filtering. MySQL/MariaDB existing APM/retention compatibility remains intact; their retained log storage capability is unchanged and still requires a configured supported log store.
- `logs.read`, `apm.read`, Kubernetes read and namespace restrictions remain enforced. UI errors use kubiq toasts/inline messages; browser inspection found no native JavaScript dialog.
- Completion events exclude bodies, query strings, headers, cookies, credentials and personal user identifiers. Correlated audit events include the action name rather than the separate audit payload. Synthetic-secret non-disclosure was tested in both the real SDK fixture and actual production image.
- MongoDB reported zero SERVER spans and zero completion logs for `/api/logs/trace/` after verification. Lookup requests do not generate observer traces/logs.

The identifier model follows [OpenTelemetry log TraceId/SpanId correlation](https://opentelemetry.io/docs/specs/otel/logs/data-model/). Other applications require their own logger integration and collection path; this release did not add Portfolio log instrumentation or claim every background line has a span.

## Health, resources and remaining observation

- kubiq pod Ready, zero restarts, approximately 132 MiB / 20m CPU at final observation. Existing CPU and 512 MiB memory limits unchanged.
- kubiq health 200; unauthenticated ingestion/analytics 401. Portfolio health, activity and SSE were all 200 with activity events available. All five Flux Kustomizations were Ready.
- Production-image fixture peak observations: 117,440,512 bytes without tracing, 102,273,024 bytes with tracing. These are independent test samples, not a claim of reduced tracing overhead; no OOM/restart occurred.
- A live snapshot allocated 487,424 bytes for log data and 2,220,032 bytes for log indexes. Existing seven-day log TTL (604,800 seconds), three-day APM retention, queue bounds, MongoDB authentication and signing/ingestion secrets were preserved. No sampling, VM resize or retention reduction was introduced.
- New stdout/source mirrors can add retained storage while viewers are connected. A representative 24-hour growth/index measurement remains unobserved; short verification traffic is not a completed capacity forecast.
- The on-demand Sonar VM was observed stopped after its successful exported analysis; its existing idle policy was unchanged. Routine publishing used the verified exact-commit workflow evidence; no globally bypassed Access policy or new credential was introduced.

Rollback remains a GitOps image change to the prior release, without changing databases, deleting retained logs or removing application secrets. See [log-source operations](kubernetes-log-sources.md).
