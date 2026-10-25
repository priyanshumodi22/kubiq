<!-- Generated from docs/apm/instrumentation.json; edit the source, then regenerate. SHA256: 766ee70469200b4d40c1fa07b5f5961975e91868630e0885b26a584e10d1c323 -->

# kubiq APM Integration Guide

Connect Node.js, Python, Java, Go and Next.js applications with tested, authenticated tracing.

## Environment Variables Configuration

kubiq accepts OTLP HTTP JSON at /api/apm/v1/traces, not direct protobuf. Use the complete backend URL, including its optional prefix. Example production URL: https://priyanshumodi.in/kubiq-api/api/apm/v1/traces. Local development may use http://localhost:3001/api/apm/v1/traces. Use HTTPS for remote ingestion. Set a distinct OTEL_SERVICE_NAME per application. Never expose the ingestion token in browser/client code.

Commands use POSIX shell syntax. In PowerShell, set environment variables with $env:NAME = "value", then start the application in that same environment. The ingestion token must come from your secret manager, never client-side code.

Collector examples are pinned to 0.123.0. Node/Python package versions are 1.0.1/1.0.1.

## 1. Node.js (Express, NestJS, Fastify)

Preload the kubiq wrapper before importing HTTP, Express, NestJS or Fastify. It instruments supported installed modules; it does not cover every database or framework automatically.


### Install the wrapper

```bash
npm install kubiq-apm@1.0.1
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

## 2. Python (Django, Flask, FastAPI)

Run the local Collector first. Bootstrap plugins in the application virtual environment, then start your application with the wrapper. The bundled exporter uses protobuf; changing its protocol string does not make it a JSON exporter.


### Required local Collector

Run the pinned Collector beside the application in the same network namespace (same Pod or host). Its receiver binds to loopback; a separate Docker network needs an explicitly private listener and access restriction, not a public port. The Collector forwards JSON with bearer authentication. This Collector is separately installed; kubiq does not automatically provide one.

### Collector configuration

File: `collector.yaml`

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 127.0.0.1:4318
processors:
  batch:
    send_batch_size: 50
    send_batch_max_size: 50
exporters:
  otlphttp/kubiq:
    traces_endpoint: ${env:KUBIQ_TRACES_ENDPOINT}
    encoding: json
    compression: none
    headers:
      Authorization: Bearer ${env:KUBIQ_INGESTION_TOKEN}
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp/kubiq]
```

### Start the Collector in its own environment

```bash
# These variables belong to the Collector process, not the application.
export KUBIQ_TRACES_ENDPOINT="https://<kubiq-host><backend-context>/api/apm/v1/traces"
# Supply KUBIQ_INGESTION_TOKEN using your secret manager.
# Download and verify the official otelcol-contrib v0.123.0 binary for your OS.
otelcol-contrib validate --config=collector.yaml
otelcol-contrib --config=collector.yaml
```

### Install and bootstrap the wrapper

```bash
python -m pip install kubiq-apm==1.0.1
kubiq-apm install
```

### Configure the application environment

```bash
export OTEL_SERVICE_NAME="my-service"
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="http://127.0.0.1:4318/v1/traces"
export OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"
export OTEL_METRICS_EXPORTER="none"
export OTEL_LOGS_EXPORTER="none"
# Do not forward kubiq's ingestion token to this local receiver.
```

### Start your existing application

```bash
# Flask example; install Flask in this virtual environment first.
kubiq-apm flask --app app run --host 0.0.0.0 --port 8000
# Alternatives:
# kubiq-apm uvicorn main:app --host 0.0.0.0 --port 8000
# kubiq-apm python manage.py runserver
```

## 3. Java (Spring Boot)

Download opentelemetry-javaagent v2.14.0 from its official GitHub release and verify its checksum. Start the local Collector first. The existing authenticated Zipkin receiver remains supported for previously configured clients; OTLP through the Collector is the recommended setup.


### Required local Collector

Run the pinned Collector beside the application in the same network namespace (same Pod or host). Its receiver binds to loopback; a separate Docker network needs an explicitly private listener and access restriction, not a public port. The Collector forwards JSON with bearer authentication. This Collector is separately installed; kubiq does not automatically provide one.

### Collector configuration

File: `collector.yaml`

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 127.0.0.1:4318
processors:
  batch:
    send_batch_size: 50
    send_batch_max_size: 50
exporters:
  otlphttp/kubiq:
    traces_endpoint: ${env:KUBIQ_TRACES_ENDPOINT}
    encoding: json
    compression: none
    headers:
      Authorization: Bearer ${env:KUBIQ_INGESTION_TOKEN}
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp/kubiq]
```

### Start the Collector in its own environment

```bash
# These variables belong to the Collector process, not the application.
export KUBIQ_TRACES_ENDPOINT="https://<kubiq-host><backend-context>/api/apm/v1/traces"
# Supply KUBIQ_INGESTION_TOKEN using your secret manager.
# Download and verify the official otelcol-contrib v0.123.0 binary for your OS.
otelcol-contrib validate --config=collector.yaml
otelcol-contrib --config=collector.yaml
```

### Download and verify the official Java agent

```bash
curl --fail --location --output opentelemetry-javaagent.jar https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.14.0/opentelemetry-javaagent.jar
printf '16f8e28fa1ddcd56ed85bf633bd1d1fbc78ea7c4cc50e8c5726b2a319f5058c8  opentelemetry-javaagent.jar\n' | sha256sum --check
```

### Configure the application environment

```bash
export OTEL_SERVICE_NAME="my-service"
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="http://127.0.0.1:4318/v1/traces"
export OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"
export OTEL_METRICS_EXPORTER="none"
export OTEL_LOGS_EXPORTER="none"
# Do not forward kubiq's ingestion token to this local receiver.
```

### Start your existing Spring Boot jar

```bash
java -javaagent:opentelemetry-javaagent.jar \
  -Dotel.traces.exporter=otlp \
  -jar my-app.jar
```

## 4. Next.js 13+ (App Router)

For Next.js 15/16 App Router on the Node runtime, use instrumentation.ts at the project root (or src/). Do not preload kubiq-apm/auto as well: that would initialize tracing twice. Edge/browser instrumentation is not included. Next.js 13/14 requires its legacy experimental.instrumentationHook setting; current versions do not. Set KUBIQ_TRACE_PROPAGATION_ORIGINS to the trusted downstream service origins that should receive trace context; external destinations are not enabled by default.


### Install compatible tracing packages

```bash
npm install kubiq-apm@1.0.1 @vercel/otel@1.13.0
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

## 5. Go (net/http)

Unlike the Java agent or Node/Python wrappers, Go needs explicit tracing initialization and HTTP handler/client wrappers. Start the local Collector first.


### Required local Collector

Run the pinned Collector beside the application in the same network namespace (same Pod or host). Its receiver binds to loopback; a separate Docker network needs an explicitly private listener and access restriction, not a public port. The Collector forwards JSON with bearer authentication. This Collector is separately installed; kubiq does not automatically provide one.

### Collector configuration

File: `collector.yaml`

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 127.0.0.1:4318
processors:
  batch:
    send_batch_size: 50
    send_batch_max_size: 50
exporters:
  otlphttp/kubiq:
    traces_endpoint: ${env:KUBIQ_TRACES_ENDPOINT}
    encoding: json
    compression: none
    headers:
      Authorization: Bearer ${env:KUBIQ_INGESTION_TOKEN}
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp/kubiq]
```

### Start the Collector in its own environment

```bash
# These variables belong to the Collector process, not the application.
export KUBIQ_TRACES_ENDPOINT="https://<kubiq-host><backend-context>/api/apm/v1/traces"
# Supply KUBIQ_INGESTION_TOKEN using your secret manager.
# Download and verify the official otelcol-contrib v0.123.0 binary for your OS.
otelcol-contrib validate --config=collector.yaml
otelcol-contrib --config=collector.yaml
```

### Install compatible OpenTelemetry modules

```bash
go get go.opentelemetry.io/otel@v1.34.0 go.opentelemetry.io/otel/sdk@v1.34.0 go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp@v1.34.0 go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp@v0.59.0
```

### Configure the application environment

```bash
export OTEL_SERVICE_NAME="my-service"
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="http://127.0.0.1:4318/v1/traces"
export OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"
export OTEL_METRICS_EXPORTER="none"
export OTEL_LOGS_EXPORTER="none"
# Do not forward kubiq's ingestion token to this local receiver.
```

### Initialize tracing and instrument HTTP

File: `tracing.go`

```go
package main

import (
  "context"
  "net/http"
  "go.opentelemetry.io/otel"
  "go.opentelemetry.io/otel/propagation"
  "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
  "go.opentelemetry.io/otel/sdk/resource"
  sdktrace "go.opentelemetry.io/otel/sdk/trace"
  "go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

func initTracer(ctx context.Context) (*sdktrace.TracerProvider, error) {
  exporter, err := otlptracehttp.New(ctx)
  if err != nil { return nil, err }
  res, err := resource.New(ctx, resource.WithFromEnv(), resource.WithTelemetrySDK())
  if err != nil { return nil, err }
  provider := sdktrace.NewTracerProvider(sdktrace.WithBatcher(exporter), sdktrace.WithResource(res))
  otel.SetTracerProvider(provider)
  otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))
  return provider, nil
}

// Wrap your server handler and use this client for outgoing HTTP calls.
func tracedHandler(handler http.Handler) http.Handler {
  return otelhttp.NewHandler(handler, "http.server")
}
func tracedClient() *http.Client {
  return &http.Client{Transport: otelhttp.NewTransport(http.DefaultTransport)}
}
// Call initTracer before serving, propagate request.Context() to outgoing calls,
// and await provider.Shutdown(ctx) with a timeout during graceful shutdown.
```

### Start your application

```bash
go run .
```

## Verify real delivery

Send real requests to an instrumented HTTP route, then find OTEL_SERVICE_NAME in APM & Traces. Check a trace waterfall and downstream parent/child spans. Allow the batch interval or graceful shutdown to flush. HTTP 401 means ingestion authentication failed; HTTP 415 indicates the wrong wire format; a private Collector must be running before protobuf clients start. An HTTP acceptance response alone is not proof of persisted spans. MongoDB or MySQL APM storage must be enabled; JSON-only storage does not persist APM traces. Log correlation additionally requires log ingestion containing the trace ID.
