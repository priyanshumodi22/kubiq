# Log configuration and workload explorer verification — 29 October 2026

## Release evidence

- Final application source: `285f4fe152f6f914e03ea77c5604e003f2c367e5`.
- Deployed image: `priyanshumodi22/kubiq:main-188`.
- Flux image commit: `13d45abb5fb48b946f89eb9cb80bf738297a02bf`.
- [Exact-commit Sonar release scan](https://github.com/priyanshumodi22/kubiq/actions/runs/40721978411): passed, including existing fixed new-code scope, coverage, finding-review and export requirements.
- [Production image workflow](https://github.com/priyanshumodi22/kubiq/actions/runs/40722879374): passed application verification, Node 20/22 SDK compatibility, MongoDB/MySQL/MariaDB/ClickHouse regressions, authenticated bundled-image MongoDB checks and publication.
- 475 backend tests / 84 suites and 393 frontend tests / 69 files passed. TypeScript/production builds and frontend lint passed. Backend lint retains its existing 382 explicit-any warnings and has zero errors.

## User-facing changes

The source chooser uses the shared kubiq log-dialog shell: a top-right X and two footer choices, Kubernetes logs and VM service logs. The Kubernetes form follows the VM configuration layout and uses kubiq CustomSelect controls throughout. Removal retains kubiq's confirmation dialog; validation/save feedback uses application messages. Browser alert/confirm/prompt is prohibited by existing lint rules.

The explorer Workloads group now includes Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs, ReplicationControllers and Pods. New rows expose readiness or batch scheduling/completion status, age and details/YAML inspection. Pod rows identify the owner kind/name, including custom controller kinds. API failures are shown with Retry; old responses cannot overwrite a later selection. Standard workload log-source discovery matches this coverage.

This is not a generic custom-resource/CRD browser. Custom controller owners remain visible on Pods; pod/Service/namespace log targets are available for their logs.

## Actual Chrome and k3s verification

- Reloaded the final deployed app and confirmed the expanded navigation.
- `mongodb-system` StatefulSets lists `mongodb` with desired 1, ready 1 and Ready status. Its YAML loaded as `kind: StatefulSet` without errors. Pods identifies `mongodb-0` as owned by `StatefulSet/mongodb`, Running, 1/1, zero restarts.
- A real DaemonSet (`svclb-traefik-6183d14f`) appeared in kube-system as 1 desired / 1 ready. Actual apps ReplicaSets displayed Ready or Scaled to zero appropriately.
- A disposable suspended CronJob and manually owned Job verified schedule/Suspended and Complete/1-of-1 states. On final main-188, its Job row showed an Age of 5h and six cells matching six headers; all six new workload types have automated cell/header-count regressions.
- Saved a CronJob source through the redesigned custom form. Container discovery found its owned `worker`. Selecting it displayed both real finite log lines and ENDED status.
- Verified custom namespace keyboard ArrowDown/Enter selection and Escape closing the dropdown while keeping the form open. The top-right X closes the form and returns focus. Source removal used kubiq's own confirmation; no JavaScript browser dialog was present.
- The VM choice still opens its existing file-log configuration. It was cancelled without editing existing monitored-service data.
- Final unsaved MongoDB/StatefulSet form discovery was inspected and captured, then closed without creating a permanent source or changing MongoDB.

## Finished-log correctness

A real HTTP/Socket.IO fixture exposed that volatile delivery could lose a short, finite Job tail. Completed-container tails now use reliable packets with a Kubernetes-side 256 KiB response cap per container. Finished streams report completion and are not repeatedly reopened. Failed reads and mixed live/completed pods do not falsely report global completion. Live streams retain their existing volatile/backpressure behavior and queue/line/stream bounds.

The transport fixture verifies actual Kubernetes client APIs, native socket authentication, namespace denial, saved-source APIs, completed Job output/status, replacement pods, independent subscribers, revocation and cleanup. Unit tests additionally cover CronJob owner-UID isolation and Job/RC/ReplicaSet selectors.

## Cleanup and final health

- Removed the exact disposable CronJob/Job/pod and temporary saved source. Confirmed zero remaining fixture resources, zero configured fixture sources and zero retained synthetic rows. Existing application data was not deleted.
- All five Flux Kustomizations Ready. main-188 observed Ready with zero restarts after over five hours; 134 MiB memory / 11m CPU within unchanged limits.
- kubiq and portfolio health: 200. Portfolio activity and SSE event: 200/verified. Unauthenticated ingestion and analytics: 401.
- SonarQube VM observed TERMINATED under its existing on-demand policy.
- Existing namespace/application permission checks remain. Added only get/list/watch for Jobs/CronJobs and legacy ReplicationControllers to kubiq's service account; no new mutations and no change to the separate kubi identity.
- Retention, database destinations, credentials, VM sizing and permanent workloads were not altered for testing. Kubernetes log collection remains viewer-connected rather than an always-on collector.

See [configuration and permissions](kubernetes-log-sources.md).
