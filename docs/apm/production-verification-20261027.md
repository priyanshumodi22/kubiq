# Production APM verification - 27 October 2026

Both permanent producers are enabled through GitOps: `kubiq-backend` and `portfolio`. The database remains the authenticated, self-hosted MongoDB; no VM, CPU, memory-limit or retention increase was needed. Both profiles capture every eligible server request. Browser navigation and CDN hits that never reach a server remain outside coverage.

## Release evidence

- Node `kubiq-apm@1.1.0` published with provenance from SDK commit `0ba5dcb0b5cb6afd9568ccf2bd5dc162d781c2f3`. Python was not republished.
- Backend source/image commit `e7fcccdfc31f9091c68df9558691aad07e32f0d2`: [exact-commit Sonar scan](https://github.com/priyanshumodi22/kubiq/actions/runs/40430173434) passed, including zero open/confirmed issues and zero unreviewed hotspots. The fixed new-code baseline and 80% coverage gate remain in place.
- [Backend actual-image release](https://github.com/priyanshumodi22/kubiq/actions/runs/40430430368) passed application verification, packaged SDK on Node 20/22, all four real database fixtures, and actual-image tests before publishing `priyanshumodi22/kubiq:main-169`. Digest: `sha256:0e2d15e92014fed366e135b6faa216c672e591ae5ddf11812effca4b81d248ac`.
- Backend tests: 72 suites / 417 tests. The image tests verified authenticated ingestion and analytics with the producer disabled, real MongoDB children, request-only metrics, SSE delivery, noise suppression, private diagnostics and final loopback persistence during shutdown.
- [Portfolio actual-image release](https://github.com/priyanshumodi22/Portfolio/actions/runs/40425067759) tested the real Node 22 image at 128 MiB, including ESM startup, activity persistence/SSE, upstream errors, aborted requests and shutdown. Production image is `ghcr.io/priyanshumodi22/portfolio:main-6`.
- Backend enable commit `e817cc5747723d4ca89033edf5cbc41ccac7add8`; portfolio enable commit `db75d7deeb25de21b285e0b1bd032d3c56d50c02`. kubiq was enabled and verified first. All five Flux Kustomizations were Ready after both rollouts.

## Real delivery and correctness

Authenticated browser requests generated persisted kubiq SERVER spans with MongoDB repository children. Trace `e4f93e8eb0dd9ed930ddf6c91811a730` was opened in the production inspector: `GET /kubiq-api/api/services/status` followed by its correctly parented `mongodb.users.findById` child.

A real portfolio page request and a successful `/api/github` request were persisted. Trace `f459201424623f7d9b01bc966c60c5a6` was opened in the inspector: one `GET /api/github` SERVER span and two `github.request` children to GitHub. These are real production requests, not manually inserted span fixtures. Their normal three-day TTL still applies.

At the recorded capacity snapshot, kubiq had 18 requests / 43 total spans and portfolio had 6 requests / 8 total spans. Both overview cards displayed **Server requests**; dependency spans did not inflate request counts. All 27 dependency spans had matching parents. No forbidden credential/body/query/statement attribute keys or loopback/ClusterIP export dependency spans were found.

The existing Portfolio uptime monitor originally requested `/` every 30 seconds, creating legitimate but unwanted page traces. Its endpoint was changed through the authenticated UI to `https://priyanshumodi.in/health`, retaining its identity, history, interval and retries. Persistence was independently verified. Health monitoring remained healthy and no longer generated page spans.

From 01:19:33Z to 01:20:41Z, the count stayed at 303 total APM documents (51 belonging to the permanent services) while health checks continued. The newest permanent span remained at 01:18:56Z. This checks idle feedback-loop suppression; later real visitors or verification requests can legitimately add spans.

Live checks also confirmed both health endpoints return 200; unauthenticated ingestion and analytics remain 401. Portfolio activity data remains present, and its live SSE stream returned 200 with an activity event. No signing/encryption keys, database credentials, existing traces or activity files were replaced. The dedicated portfolio Secret contains only the existing ingestion token.

## Resource and storage report

| Measurement | kubiq | portfolio |
|---|---:|---:|
| Production memory limit (unchanged) | 512 MiB | 128 MiB |
| CPU limit (unchanged) | 400m | 200m |
| Actual-image CI peak, producer disabled | 110.4 MiB | 25.1 MiB |
| Actual-image CI peak, producer enabled | 115.5 MiB | 28.7 MiB |
| Observed production peak, enabled | 115.3 MiB | 38.5 MiB |
| Production restarts / OOM terminations | 0 / 0 | 0 / 0 |

Production peaks are point-in-time container peaks, not a long-term load benchmark. The VM stayed at one vCPU / 4 GiB; approximately 1.56 GiB remained available and 14.3 GiB of boot disk space remained free. MongoDB's 768 MiB limit stayed unchanged.

At 01:20:41Z, the entire APM collection had 303 documents, 194,151 uncompressed data bytes, 110,592 allocated storage bytes and 327,680 index bytes. Its timestamp TTL was verified as 259,200 seconds (three days).

The initial projection is **134.1 MiB for three days**, below the initial **512 MiB APM budget**. It sums each service's observed span rate times its observed mean BSON size plus a conservative index allowance of 1,202.8 bytes per span, over 259,200 seconds. The estimate then doubles data/index growth for allocator headroom and adds the existing footprint. It uses a short window that includes verification traffic, the monitor correction and idle time; it is not a traffic guarantee or disk quota. Sampling, retention and VM sizing were not changed to obtain this result.

Machine-readable snapshots and the exact calculation inputs are in [`ops/apm-production/evidence`](../../ops/apm-production/evidence/). They contain capacity/configuration metadata, not credentials or span payloads.

**The full 24-hour usage check is pending.** Review no earlier than 28 October 2026 at 01:17 UTC (06:47 IST), using a new capacity snapshot and counts/BSON bytes for the first complete day of both services. Recalculate three-day data plus index growth, inspect OOM/restarts and disk headroom, and compare with 512 MiB. If it exceeds the budget, stop the tracing rollout and report it; do not silently sample, shorten retention or resize.

## Recovery and documentation

The public `/docs/apm` guide and in-app Instrument Service dialog were checked in Chrome: both show Node 1.1.0 and the same controlled-runtime alternative. The public environment-template preview includes the independent producer flag and full context-path receiver URL. Website guide source hash is `e6b9ac55ca3eec8ca4d8e3730b84ae0ec0299aef0777f69f7f2b37fab1222cc6`.

To disable a producer, change `KUBIQ_TRACING_ENABLED` to `'false'` in that Deployment's explicit container `env` and commit/push through GitOps. Because it is part of the Pod template, Flux restarts the producer; changing an envFrom ConfigMap alone does not restart a Pod. Keep the receiver, database and retention enabled. Do not delete historical spans. For image rollback, retain kubiq `main-157` and portfolio `main-4`, and pin or suspend their image automation before selecting an older image so Flux cannot immediately advance it again.

The image gate caught and prevented two unsafe releases: buffered initial SSE events, and a shared MongoDB connection closed before the final trace batch was persisted. Both were fixed and tested before production publishing. A passing Sonar scan does not remove the documented inactive legacy auto-instrumentation dependency advisories; see [production profiles](production-profiles.md).
