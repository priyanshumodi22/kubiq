# kubiq-apm (Python)

The official, zero-configuration Python APM wrapper for **kubiq**.

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
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | `http://localhost:3001/api/apm/v1/traces` | Where kubiq is running |
| `OTEL_BSP_MAX_EXPORT_BATCH_SIZE` | `50` | Batched spans limit |
| `OTEL_BSP_SCHEDULE_DELAY` | `2000` | Flush delay (ms) |
