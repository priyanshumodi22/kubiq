# kubiq-apm (Python)

The Python auto-instrumentation wrapper for **kubiq**.

## Required transport setup

The bundled Python exporter sends OTLP HTTP protobuf, whereas kubiq's direct
`/api/apm/v1/traces` endpoint accepts HTTP JSON. Run a separate OpenTelemetry
Collector beside the application to convert protobuf to JSON. kubiq does not
automatically expose a Collector on port 4318. The wrapper rejects a direct kubiq
URL with a protobuf configuration instead of silently losing spans.

Configure the Collector with a loopback receiver, a batch maximum of 50, and an
`otlp_http` exporter using `encoding: json`, `compression: none`,
`traces_endpoint: ${env:KUBIQ_TRACES_ENDPOINT}` and
`headers: {Authorization: "Bearer ${env:KUBIQ_INGESTION_TOKEN}"}`.
Set the Collector's `KUBIQ_TRACES_ENDPOINT` to the complete HTTPS kubiq URL,
including any configured backend context prefix and `/api/apm/v1/traces`.
The APM instrumentation dialog includes the complete configuration. Older
Collector releases name this exporter `otlphttp`.

The ingestion token belongs in the Collector environment, not in source code.
Keep the local protobuf receiver private; use HTTPS for remote kubiq traffic.

This package bundles OpenTelemetry and provides a seamless auto-instrumentation wrapper so you can connect your Django, Flask, FastAPI, or generic Python apps to kubiq without modifying a single line of code.

## Installation

```bash
pip install kubiq-apm
```

After installing, run the one-time install command to download the relevant plugins for your project (like Flask, SQLAlchemy, etc):

```bash
kubiq-apm install
```

## Usage

Instead of running your python app normally (e.g. `python main.py`), simply prepend `kubiq-apm`:

```bash
export OTEL_SERVICE_NAME="my-python-api"

kubiq-apm python main.py
```

### Advanced (Gunicorn / Uvicorn)

It works perfectly with production web servers too:

```bash
kubiq-apm uvicorn main:app --host 0.0.0.0 --port 8000
```

## Configuration

kubiq-apm automatically configures defaults optimized for the kubiq dashboard. You can override them via standard environment variables:

| Variable | Default | Description |
|---|---|---|
| `OTEL_SERVICE_NAME` | `unknown-python-service` | The name of your service on the dashboard |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | `http://127.0.0.1:4318/v1/traces` | The separately operated local Collector |
| `OTEL_EXPORTER_OTLP_HEADERS` | unset | Optional SDK-to-Collector authentication; kubiq ingestion authentication is configured on the Collector |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `http/protobuf` | The Collector converts this to JSON before sending to kubiq |
| `OTEL_BSP_MAX_EXPORT_BATCH_SIZE` | `50` | Batched spans limit |
| `OTEL_BSP_SCHEDULE_DELAY` | `2000` | Flush delay (ms) |
