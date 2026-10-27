<!-- Generated from docs/apm/instrumentation.json; edit the source, then regenerate. SHA256: 510bc9fadc56a19a54724067514b0d88ca14af9b3027adbe6a96b648293f5d16 -->

# kubiq APM Integration Guide

Connect Node.js, Python, Java, Go and Next.js applications with tested, authenticated tracing.

## Environment Variables Configuration

kubiq accepts OTLP HTTP JSON at /api/apm/v1/traces, not direct protobuf. Use the complete backend URL, including its optional prefix. Example production URL: https://priyanshumodi.in/kubiq-api/api/apm/v1/traces. Local development may use http://localhost:3001/api/apm/v1/traces. Use HTTPS for remote ingestion. Set a distinct OTEL_SERVICE_NAME per application. Never expose the ingestion token in browser/client code.

Commands use POSIX shell syntax. In PowerShell, set environment variables with $env:NAME = "value", then start the application in that same environment. The ingestion token must come from your secret manager, never client-side code.

Collector examples are pinned to 0.123.0. Node/Python package versions are 1.1.1/1.0.1.

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

## Verify real delivery

Send real requests to an instrumented HTTP route, then find OTEL_SERVICE_NAME in APM & Traces. Check a trace waterfall and downstream parent/child spans. Allow the batch interval or graceful shutdown to flush. HTTP 401 means ingestion authentication failed; HTTP 415 indicates the wrong wire format; a private Collector must be running before protobuf clients start. An HTTP acceptance response alone is not proof of persisted spans. MongoDB or MySQL APM storage must be enabled; JSON-only storage does not persist APM traces. Log correlation additionally requires log ingestion containing the trace ID.
