# VM and Kubernetes sources in Logs

Open **Logs → Add Log Source** and choose **VM service logs** or **Kubernetes logs**. Configuration and validation use kubiq's shared dialogs and toast messages; browser alert/confirm/prompt calls are not used.

## VM service logs

The existing monitored-service/file-path workflow remains available. Paths must be visible to the kubiq backend process/container and pass its existing path restrictions. Configuring a service does not install a remote VM agent or establish SSH access. Mount the relevant files or use the existing ingestion mechanism for remote producers.

## Kubernetes logs

Save a label, permitted namespace, resource type/name and optional container. An empty container selection follows all regular containers in matching pods. Supported targets are Service, Deployment, StatefulSet, DaemonSet, ReplicaSet, Job, CronJob, legacy ReplicationController, individual pod and entire namespace. Job sources can read completed pods while Kubernetes retains their logs; CronJob sources resolve Jobs and pods by owner UID, without including unrelated Jobs. Sources use kubiq's default Kubernetes connection, independently of a context selected elsewhere in the Kubernetes dashboard.

Service sources resolve the Service's pod selector. Workloads resolve their actual label selectors, including match expressions. Selectorless Services are rejected rather than accidentally streaming every pod. Workload/Service/namespace sources rediscover matching pods every ten seconds and follow replacement pod UIDs and container restarts. Pod sources are intentionally pinned to one pod name; choose a workload or Service for rolling deployments.

The sidebar groups VM and saved Kubernetes sources and displays each Kubernetes namespace/target. Select a saved source to stream in the existing Kubernetes viewer. Every line is prefixed with namespace, pod and container. Re-selecting a saved source reconnects it. Initial tail choices remain 50/100/200/500 lines per container. Scale-to-zero sources display a waiting state and retry discovery. API failures, denied permissions and removed/changed configuration are reported rather than displayed as healthy empty logs.

There are at most 20 container streams per viewer and 100 active container streams per kubiq backend. A broader target fails with a message asking for a narrower selection. Client rendering retains the latest 10,000 lines. Log lines, packet sizes, replay fingerprints and incomplete line buffers are bounded. A slow/disconnected viewer can miss live packets; this is not a durable collector guarantee.

Closing, changing sources or disconnecting cancels the owned Kubernetes requests. Each viewer owns its stream handles, so one viewer disconnecting cannot remove another viewer's subscription. Kubernetes log streams use the existing service-account/kubeconfig identity; it needs resource reads and `get` on `pods/log`. No new cluster-wide privilege is granted by saving a source.

## Access and persistence

Viewing saved Kubernetes streams requires `logs.read`, `kubernetes.read` and access to the saved namespace. Configuration requires those permissions plus `services.manage` and `logs.raw.read`, matching the existing VM configuration controls. The server resolves the saved source ID; client-supplied namespaces or selectors cannot override it. Authentication, current roles and namespace access are rechecked on discovery, so revocation closes an existing subscription within the ten-second interval.

Sources persist through the system configuration repository on JSON, MongoDB, MySQL and MariaDB. Updates modify one source ID and preserve other sources and unrelated system configuration. Existing service log paths and source records are not migrated or overwritten. Existing numeric JSON user IDs are preserved; newly created JSON users use UUIDs to prevent same-millisecond account collisions.

Saved-source metadata and retained log data are separate. Raw retained-log discovery, queries and AI summary lookups for `k8s:<namespace>:...` also enforce Kubernetes permission and namespace scope. Removing a source removes its saved configuration, not retained log records.

New live records use the stable service key `k8s:<namespace>:<source-id>` and `pod:<pod>:<container>` source key. Retention/search requires MongoDB or the existing ClickHouse telemetry override; MySQL/MariaDB/JSON base configuration can still save sources and stream live logs. The initial old tail is displayed but is not repeatedly inserted into retention. A bounded fingerprint cache suppresses duplicate persistence from simultaneous viewers. This remains on-demand collection while the viewer is connected, not a permanent background collector. Existing `LOG_RETENTION_PERIOD` and ingestion buffer limits remain unchanged.

## Verification

Backend tests cover source validation, selector resolution, namespace filtering, management permissions, retained-history restrictions, adapter persistence, scale-from-zero, pod replacement, restart/retry, replay deduplication and cancellation. The real HTTP/Socket.IO transport fixture additionally uses the installed Kubernetes client, native authentication and saved-source HTTP APIs. It verifies labeled multi-container data, independent viewers, namespace denial, replacement pods and revocation without contacting a live cluster.

Run:

```powershell
npm run build --prefix backend
node ops/kubernetes-logs/transport.cjs
```

The fixture uses an explicitly insecure HTTP connection only to its disposable loopback API server. Production kubeconfig TLS settings are not changed. Database adapter regression fixtures additionally round-trip saved-source configuration against actual disposable MongoDB, MySQL and MariaDB servers.

Discovery uses a pinned copy of the default cluster configuration, an eight-second deadline, and cancellation when the viewer closes. Dashboard context changes cannot redirect a saved source.

## Workload discovery in Kubernetes Explorer

The Workloads sidebar lists Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs, ReplicationControllers and Pods on desktop and mobile. Pod rows identify their controller kind/name, including custom controller kinds. Standard workload rows expose readiness or Job/CronJob state and support detail/YAML inspection. Empty, failed and permission-denied queries are distinguished; stale requests cannot overwrite a later selection.

This is a standard Kubernetes workload explorer, not a generic browser for every operator-specific custom resource. Custom-owned pod labels identify that owner, while pod/Service/namespace log sources remain available. The kubiq service account gains only get/list/watch on batch Jobs/CronJobs and legacy ReplicationControllers; the separate kubi identity and all mutation permissions are unchanged.

Log configuration uses kubiq's shared log-dialog shell with a top-right close control and side-by-side source choices. All Kubernetes form selectors use the existing keyboard-operable CustomSelect. Removal still uses kubiq's confirmation dialog, and validation/save errors use application feedback, never browser alert/confirm/prompt.

Completed Job/CronJob pods are read without follow mode and shown as ended; their finished streams are not repeatedly reopened while the saved target continues discovering new Jobs.

Finished-container tails use reliable Socket.IO packets (live streams remain volatile under backpressure), capped by the Kubernetes request at 256 KiB per container. This prevents the single finite log response being lost while bounding its response/queue size.


## Trace-to-log correlation

The APM waterfall's **View Trace Logs** link opens a retained-log search automatically across sources the signed-in user may read. It uses an exact trace ID, the stored trace's time window with a one-minute margin, and at most 500 results. Selecting a sidebar source narrows the search; **Search all permitted sources** resets it. This search does not start a live Kubernetes stream. Namespace restrictions apply before querying, and both `logs.read` and `apm.read` are required.

When controlled kubiq tracing is enabled (`KUBIQ_TRACING_ENABLED=true`), eligible HTTP requests record one completion event with trace/span IDs, normalized route, method, status, duration and completion/abort outcome. Bodies, headers, cookies, raw URLs and query strings are excluded. The existing bounded ingestion buffer persists these events directly as `kubiq-backend / http-requests`; no connected log viewer is required. Existing log retention applies independently of APM retention. Export, persistence, health/SSE/asset exclusions and correlation lookups create no completion events.

MongoDB and ClickHouse support this retained search. ClickHouse adds its trace-ID column idempotently, keeping existing rows. Structured IDs and complete IDs in legacy message text are supported; SQL/JSON deployments without retained log storage receive an explicit unsupported response rather than an empty success. Database failures are shown as errors through kubiq's toast and inline message.

A trace alone does not create historical application logs. An older trace can correctly have no matches. Other applications must emit trace IDs in logs and arrange collection; Kubernetes sources remain viewer-connected. Missing/deleted traces use a seven-day fallback search window, with the actual window shown in the UI. A source filter with no retained records may be unavailable and can be reset to all permitted sources.


### Production dependency boundary

The backend keeps both `kubiq-apm/runtime` and `@opentelemetry/api` external to its ncc bundle. Backend and production telemetry manifests/lockfiles pin the same API version, enforced by the deployment dependency-contract test. The real image check also asserts every request-completion event matches an actual SERVER span. A higher bundled API version cannot read a context registered by an older external API; unit mocks alone do not validate that boundary.


## Bidirectional log and span navigation

Eligible kubiq request-completion events are emitted as JSON to **both container stdout and bounded retained-log ingestion**. Request/audit-action/error events emitted by kubiq's correlated logger inherit the real active span; stale background callbacks do not inherit a completed request's IDs. Startup/background output can legitimately have no trace. Unmodified third-party stdout does not automatically become a request-scoped event. No global console monkey-patch is installed.

- Kubernetes and VM live viewers, ordinary historical search and trace-log search offer **View trace** and **View span** for valid `trace_id`/`span_id` (or camel-case equivalents). Request IDs are not assumed to be trace IDs.
- Incoming `/apm?traceId=...&spanId=...` links load the trace automatically and select that exact span in the inspector. Links respect the application's router basename, including `/kubiq`.
- The span detail panel offers **View Span Logs**. This filters by both IDs; **Search entire trace** expands the scope. Empty span results are honest: creating a span does not manufacture log events for it.
- Ingestion extracts structured IDs, event ID and event timestamp from prefixed container JSON. MongoDB and ClickHouse retain trace/span/event IDs with compatible, additive schema migration. Legacy plain messages with named IDs remain searchable.
- The same kubiq event has one UUID in its console/retained copies. Viewer-connected Kubernetes collection may retain a source-specific mirror; cross-source correlation search collapses copies with that event ID. Source-specific searches still search the selected retained source. Underlying delivery remains at least once; no existing historical rows are rewritten or deleted.
- The primary correlation contract is the OpenTelemetry logging data model: [TraceId and SpanId fields](https://opentelemetry.io/docs/specs/otel/logs/data-model/). Other services need a logger integration that emits their actual active IDs and a configured collection path. Logs without tracing context remain ordinary logs; expired traces report unavailable instead of linking to unrelated data.

These events exclude bodies, query strings, authorization headers, cookies, passwords and personal user identifiers. Audit records themselves retain their existing separate access controls; the correlated application event records the action name, not audit payloads. Existing retention, queue limits, authentication and namespace permissions remain in force. Mirrored source records and extra application events must be included in storage growth measurements; no sampling or retention change is implied.
