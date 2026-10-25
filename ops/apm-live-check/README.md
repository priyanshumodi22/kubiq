# Live APM check on k3s

This is a bounded, disposable HTTP canary, not continuous instrumentation of an
existing production application. It loads the repository's unchanged Node SDK
before `node:http`, starts separate frontend and worker processes, and makes six
real requests: two successful, two slow and two deliberate HTTP 503 responses.
Each request must have the same trace ID in both services. No OTLP fixture is
posted directly by the test driver.

The Job reuses the pinned Node runtime image already validated in this cluster.
An init container installs the SDK's existing lockfile with lifecycle scripts
disabled. The worker is a Kubernetes native sidecar, so it flushes and terminates
when the frontend exits. The Job has a ten-minute deadline, no retry, resource
limits, a read-only root filesystem, and no Kubernetes service-account token.
The existing ingestion credential is referenced from the Secret, never copied
into a manifest or printed. No Service, Ingress, firewall or IAM grant is created.

## Run from a repository checkout with kubectl configured

Confirm the target context is the intended cluster and that the namespace,
`kubiq` Service, ingestion Secret key and receiver context path match `job.yaml`.
The fixture requires native sidecar support and a database-backed APM receiver.

```bash
kubectl apply --dry-run=server -f ops/apm-live-check/job.yaml
kubectl -n kubiq-system create configmap kubiq-apm-live-check \
  --from-file=auto.js=kubiq-apm/node/auto.js \
  --from-file=exporter.js=kubiq-apm/node/exporter.js \
  --from-file=index.js=kubiq-apm/node/index.js \
  --from-file=package.json=kubiq-apm/node/package.json \
  --from-file=package-lock.json=kubiq-apm/node/package-lock.json \
  --from-file=service.cjs=ops/apm-live-check/service.cjs \
  --from-file=driver.cjs=ops/apm-live-check/driver.cjs \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f ops/apm-live-check/job.yaml
kubectl -n kubiq-system wait --for=condition=complete job/kubiq-apm-live-check --timeout=600s
kubectl -n kubiq-system logs job/kubiq-apm-live-check -c frontend
kubectl -n kubiq-system logs job/kubiq-apm-live-check -c worker
```

Do not reuse a still-running Job name. Inspect a failed Job before removing it;
its deadline bounds dependency installation and startup as well as request work.

## Verify in kubiq

Open APM with `apm.read` access and a time window covering the test. Confirm both
`kubiq-live-frontend` and `kubiq-live-worker` have persisted metrics. Inspect one
of the driver's trace IDs: the waterfall must contain the frontend server/client
and worker server spans under a common trace. The deliberate error must show
HTTP 503 and Error status. The map should show frontend → worker, six calls and
two errors. Verify the `kubiq.validation.run_id` attribute matches the Pod UID.

Then remove only the disposable resources, reload the page and confirm the
recorded telemetry remains available from storage:

```bash
kubectl -n kubiq-system delete job/kubiq-apm-live-check configmap/kubiq-apm-live-check --wait=true
kubectl -n kubiq-system get pods -l app.kubernetes.io/name=kubiq-apm-live-check
```

The built-in TTL also removes completed Jobs after thirty minutes; remove the
ConfigMap separately. Keep the saved evidence. Existing telemetry retention
applies; test records are deliberately retained and expected test errors are not
production service failures. This fixture does not configure application log
ingestion, so correlated log results require a source whose retained logs
actually contain the trace ID.

## Verified October 25, 2026

The Job completed in 55 seconds. All six requests preserved distributed context.
Chrome displayed the three-span error trace, HTTP 503, the matching run attribute,
and the six-call/two-error service-map edge. Worker P95 was 121 ms. Both test
resources were removed, and a full page reload still returned the stored metrics.
The production receiver remained ready throughout. See
`evidence-2026-10-25.json` for exact trace IDs, hashes and observations.

References: [OpenTelemetry Node setup](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
and [Kubernetes native sidecars for Jobs](https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/).
