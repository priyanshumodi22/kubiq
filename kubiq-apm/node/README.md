<!-- Generated from docs/apm/instrumentation.json; edit the source, then regenerate. SHA256: 9672f18bac1d43064930af1205bd8a723c50f3de1786b878e5a429a6cdfc78ac -->

# kubiq APM Integration Guide

Connect Node.js, Python, Java, Go and Next.js applications with tested, authenticated tracing.

## Environment Variables Configuration

kubiq accepts OTLP HTTP JSON at /api/apm/v1/traces, not direct protobuf. Use the complete backend URL, including its optional prefix. Example production URL: https://priyanshumodi.in/kubiq-api/api/apm/v1/traces. Local development may use http://localhost:3001/api/apm/v1/traces. Use HTTPS for remote ingestion. Set a distinct OTEL_SERVICE_NAME per application. Never expose the ingestion token in browser/client code.

Commands use POSIX shell syntax. In PowerShell, set environment variables with $env:NAME = "value", then start the application in that same environment. The ingestion token must come from your secret manager, never client-side code.

Collector examples are pinned to 0.123.0. Node/Python package versions are 1.1.1/1.0.1.

## 1. Node.js (Express, NestJS, Fastify)

Preload the kubiq wrapper before importing HTTP, Express, NestJS or Fastify. It instruments supported installed modules; it does not cover every database or framework automatically.


### Install the wrapper

```bash
npm install kubiq-apm@1.1.1
```

### Configure private environment

```bash
# Supply the token using your secret manager; never commit it.
export KUBIQ_TRACES_ENDPOINT="https://<kubiq-host><backend-context>/api/apm/v1/traces"
export OTEL_SERVICE_NAME="my-service"
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="$KUBIQ_TRACES_ENDPOINT"
export OTEL_EXPORTER_OTLP_TRACES_HEADERS="Authorization=Bearer ${KUBIQ_INGESTION_TOKEN:?Set the ingestion token securely}"
```

### Start your existing application

```bash
node --require kubiq-apm/auto app.js
```

### Advanced alternative: manual OpenTelemetry (do not combine with wrapper preload)

```bash
# Use this only instead of kubiq-apm/auto.
npm install @opentelemetry/sdk-node@0.48.0 @opentelemetry/auto-instrumentations-node@0.41.1 @opentelemetry/exporter-trace-otlp-http@0.48.0
# Configure the same endpoint, service name and authorization header above.
# Create tracing.cjs using the next block, then run:
node --require ./tracing.cjs app.js
```

### Advanced alternative configuration

File: `tracing.cjs`

```javascript
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME,
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();
process.on('SIGTERM', () => { sdk.shutdown().catch(console.error); });
```

### Opt-in controlled server tracing (instead of auto preload)

File: `controlled-server.cjs`

```javascript
// Do not combine this runtime with kubiq-apm/auto or another provider.
// Supply KUBIQ_TRACING_ENABLED=true, KUBIQ_INGESTION_TOKEN,
// OTEL_SERVICE_NAME and the full OTEL_EXPORTER_OTLP_TRACES_ENDPOINT privately.
const http = require('node:http');
const { startTracing, traceRequest } = require('kubiq-apm/runtime');
const tracing = startTracing({ profile: 'portfolio' });
const server = http.createServer((req, res) => traceRequest(req, res, () => {
  res.end('Hello');
}, { route: () => '/' }));
server.listen(3000);
// Your application must own signal handling: drain requests, then await
// tracing.shutdown() within its bounded graceful-shutdown deadline.
// This profile excludes telemetry, probes, static assets and streams;
// browser navigation/CDN cache hits are not server requests.

```

## 4. Next.js 13+ (App Router)

For Next.js 15/16 App Router on the Node runtime, use instrumentation.ts at the project root (or src/). Do not preload kubiq-apm/auto as well: that would initialize tracing twice. Edge/browser instrumentation is not included. Next.js 13/14 requires its legacy experimental.instrumentationHook setting; current versions do not. Set KUBIQ_TRACE_PROPAGATION_ORIGINS to the trusted downstream service origins that should receive trace context; external destinations are not enabled by default.


### Install compatible tracing packages

```bash
npm install kubiq-apm@1.1.1 @vercel/otel@1.13.0
```

### Configure server-only environment

```bash
# Supply the token using your secret manager; never commit it.
export KUBIQ_TRACES_ENDPOINT="https://<kubiq-host><backend-context>/api/apm/v1/traces"
export OTEL_SERVICE_NAME="my-service"
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="$KUBIQ_TRACES_ENDPOINT"
export OTEL_EXPORTER_OTLP_TRACES_HEADERS="Authorization=Bearer ${KUBIQ_INGESTION_TOKEN:?Set the ingestion token securely}"
# Comma-separated origins of your own trusted downstream services only.
export KUBIQ_TRACE_PROPAGATION_ORIGINS="https://your-internal-api.example.test"
```

### Register tracing before requests

File: `instrumentation.ts`

```typescript
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { registerOTel } = await import('@vercel/otel');
  const { KubiqExporter } = await import('kubiq-apm/exporter');
  const trustedOrigins = (process.env.KUBIQ_TRACE_PROPAGATION_ORIGINS || '')
    .split(',').map(value => value.trim()).filter(Boolean)
    .map(value => new URL(value).origin + '/');
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME || 'my-nextjs-service',
    traceExporter: new KubiqExporter(),
    instrumentationConfig: { fetch: { propagateContextUrls: trustedOrigins } },
  });
}
```

### Build and start the Node server

```bash
npm run build
npm run start
```

## Verify real delivery

Send real requests to an instrumented HTTP route, then find OTEL_SERVICE_NAME in APM & Traces. Check a trace waterfall and downstream parent/child spans. Allow the batch interval or graceful shutdown to flush. HTTP 401 means ingestion authentication failed; HTTP 415 indicates the wrong wire format; a private Collector must be running before protobuf clients start. An HTTP acceptance response alone is not proof of persisted spans. MongoDB or MySQL APM storage must be enabled; JSON-only storage does not persist APM traces. Log correlation additionally requires log ingestion containing the trace ID. The kubiq backend controlled profile can additionally capture actual MySQL/MariaDB and MongoDB calls with KUBIQ_TRACING_QUERY_DETAILS=true on the server. Its statement/command panel shows bounded query details with passwords, credentials and opaque body/configuration values redacted. Other query values remain visible to APM readers. Generic runtime integrations must explicitly instrument database dependencies; this flag alone does not install database hooks in an arbitrary application.
