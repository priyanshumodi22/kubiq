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
