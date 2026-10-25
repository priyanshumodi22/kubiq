# Real APM guide acceptance

This fixture sends real HTTP requests through temporary applications on k3s. It
does not instrument or restart existing business applications. The guide is
loaded from `docs/apm/instrumentation.json`: Go/Next.js initialization and the
Collector configuration are copied directly from its code blocks.

## Prepare candidate artifacts

```bash
npm pack ./kubiq-apm/node --pack-destination /tmp
python -m build kubiq-apm/python --outdir /tmp/apm-candidate
node ops/apm-guide-check/manifest.cjs node candidate /tmp/apm-node.json /tmp/kubiq-apm-1.0.1.tgz /tmp/apm-candidate/kubiq_apm-1.0.1-py3-none-any.whl
kubectl apply -f /tmp/apm-node.json
kubectl -n kubiq-system wait --for=condition=complete job/kubiq-guide-node-candidate --timeout=1200s
kubectl -n kubiq-system logs job/kubiq-guide-node-candidate -c driver
```

Repeat sequentially with runtime `python`, `java`, `go` and `nextjs`, after
checking available memory/disk. Each Pod has bounded resources, a twenty-minute
deadline, no Kubernetes service-account token, no public Service/Ingress and a
read-only root filesystem. The workspace is disposable. The Collector listens
only on Pod loopback. Only the Collector/direct exporters receive the existing
`kubiq-runtime/KUBIQ_INGESTION_TOKEN` Secret reference; do not print its value.
The fixture uses the deployed private kubiq service and its existing backend
context path; adapt that receiver URL if testing another deployment.

The six recorded requests include two successes, two deliberately slow calls
and two HTTP 503s. The independent driver checks matching trace IDs across the
caller and worker, expected status and actual delay. Readiness requests can add
extra spans/requests to overview metrics; compare the six recorded trace IDs
rather than assuming every span belongs to this sequence.

## Verify package releases

```bash
node ops/apm-guide-check/manifest.cjs node registry /tmp/apm-node-registry.json
```

Registry mode installs the exact documented npm/PyPI versions instead of local
archives. Repeat wrapper-dependent acceptance for Node, Python and Next.js.
Java uses the checksum-pinned official agent; Go downloads the pinned public Go
modules in both modes. The worker is an auxiliary Node service.

A completed Job alone is insufficient: use authenticated kubiq APM to load the
recorded traces, inspect parent/child spans, errors, latency and the service map.
Reload after cleanup to verify persistence. `negative.cjs` checks production
401/415 behavior without printing credentials. `exporter-failure.test.cjs`
uses a real SDK/exporter and local HTTP receiver to verify JSON/authentication,
denied delivery and an unavailable receiver; it is also run in CI.

## Cleanup

```bash
kubectl -n kubiq-system delete job/kubiq-guide-node-candidate configmap/kubiq-guide-node-candidate --ignore-not-found=true
```

Use the matching exact name for each runtime/mode. Jobs expire after thirty
minutes, but ConfigMaps need explicit cleanup. Retained telemetry follows normal
APM retention. Do not delete production traces or previous kubiq rollback images.
Matching log records require separate log ingestion; this fixture does not
configure it. See `candidate-evidence.json` for the five successful runs and
the Go/Next.js propagation defects discovered by these checks.
