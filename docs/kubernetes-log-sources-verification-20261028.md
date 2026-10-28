# Logs source rollout verification — 28 October 2026

## Release

- Application source: `ccd0378ca110e8d44d929bdeb2b08a0075ffb803`.
- Published/deployed image: `priyanshumodi22/kubiq:main-181`.
- Flux image commit: `cecec084020c346121216287b6a4645111a2765e`.
- [Successful exact-commit Sonar scan](https://github.com/priyanshumodi22/kubiq/actions/runs/40586705805): strict release criteria passed, zero open/confirmed findings and unreviewed hotspots. Existing fixed new-code scope and 80% coverage requirement retained. The completed report was exported before release approval.
- [Successful production image workflow](https://github.com/priyanshumodi22/kubiq/actions/runs/40587418699): exact-commit approval, builds, Node 20/22 packaged SDK checks, authenticated production-image MongoDB test and MongoDB/MySQL/MariaDB/ClickHouse regressions passed.

## Automated evidence

- Backend: 464 tests in 83 suites passed; TypeScript build passed. Lint has zero errors; 382 existing explicit-any warnings remain.
- Frontend: 366 tests in 68 files passed; lint has zero warnings/errors; production build passed in CI.
- The real HTTP/Socket.IO fixture uses native authentication and the installed Kubernetes client. It verifies saved configuration, namespace denial, all containers, pod replacement, independent subscribers, account revocation and cleanup.
- The shared kubeconfig is deliberately set to an unrelated dashboard context in that fixture; saved sources still read their pinned default context.
- Pending discovery is cancelled on disconnect and has an eight-second deadline.
- Saved configuration round-trips through actual MongoDB, MySQL and MariaDB fixtures. JSON persistence is covered locally. ClickHouse remains a telemetry override rather than a separate system-configuration adapter.

## Production Chrome and k3s evidence

Verified at `https://priyanshumodi.in/kubiq/logs`, signed in as the existing administrator:

1. **Add Log Source** opens kubiq's shared source chooser. **VM service logs** opens the existing configuration dialog without changing existing records.
2. **Kubernetes logs** opens kubiq's shared dialog with namespace, target type/resource and container fields. Empty submission shows application validation; successful save shows the kubiq success toast.
3. Saved the disposable `apps/Service/kubiq-log-verification` source. Its two pods each had `main` and `helper` containers. All four labeled streams appeared with LIVE status.
4. Reloaded the page; configuration remained in MongoDB and reappeared in the sidebar.
5. Edited the same source to container `main`. Both pods' main streams appeared; helper output was absent from the rendered viewer.
6. Restarted **only the disposable deployment while its viewer remained open**. It automatically followed both replacement pods, `kubiq-log-verification-bb486f846-ptfzl` and `kubiq-log-verification-bb486f846-qs8nw`, without source edits or reconnect actions.
7. Search returned retained records for the saved source from MongoDB, including replacement pod/container identities.
8. Remove opened kubiq's own confirmation dialog. Cancel preserved the source. Confirm removed the source and its selected viewer.
9. After removal, its retained-record count was stable at 15,317 across two checks, proving this test subscription stopped collecting. Configuration removal itself preserved those records.
10. Cleanup removed only that exact source UUID's synthetic fixture rows and the named disposable Service/Deployment. Zero fixture rows remain; existing application data was not deleted.

## Final health and boundaries

- kubiq rollout Ready with zero restarts after more than four hours; observed 128 MiB memory and 7m CPU, within unchanged limits.
- All five Flux Kustomizations Ready, including MongoDB and both portfolio deployments.
- kubiq/portfolio health endpoints: HTTP 200. Portfolio activity and SSE event checks passed. Unauthenticated ingestion and analytics remained HTTP 401.
- SonarQube VM observed TERMINATED after its existing on-demand idle policy; no always-on scanner change.
- No cluster RBAC privileges, VM sizing, retention settings, credentials or database destinations were changed by this feature.
- Browser alert/confirm/prompt calls are absent from application source. New source configuration/removal uses kubiq dialogs and toasts.
- Live logs are collected **while a viewer is connected**, with 20 container streams per viewer and 100 per backend. This does not install a continuous background collector. Retained history requires MongoDB or ClickHouse; existing VM paths must be visible to the backend. A new remote VM agent/file-stream deployment was not tested or introduced.

See [configuration and permissions](kubernetes-log-sources.md).
