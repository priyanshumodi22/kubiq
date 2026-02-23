# kubiq APM Integration Guide

Welcome to the **kubiq APM Integration Guide**! 

kubiq APM uses the industry-standard **OpenTelemetry Protocol (OTLP)** via HTTP. This means you have zero vendor lock-in and can monitor almost any programming language, framework, or database without changing your application's core logic.

---

## Environment Variables Configuration

Across *all* languages and frameworks, kubiq APM relies on these standard OpenTelemetry environment variables to know how to identify your service and where to send the traces:

| Environment Variable | Description | Example Target |
| :--- | :--- | :--- |
| `OTEL_SERVICE_NAME` | The logical name of your microservice. | `my-billing-service` |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | The EXACT URL of your kubiq APM ingestion endpoint. | `http://<kubiq-host>:3001/api/apm/v1/traces` |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | The formatting protocol (Usually HTTP Protobuf). | `http/protobuf` |


*(Note: Replace `<kubiq-host>` with `localhost` or your server's IP depending on your deployment).*

---

## 1. Node.js (Express, NestJS, Fastify)

To make Node.js instrumentation as simple as possible, use the official **kubiq APM Node.js package** (`kubiq-apm`). This package bundles all the complex OpenTelemetry dependencies and auto-instrumentations into a single seamless wrapper.

### Step 1: Install Dependencies
```bash
npm install kubiq-apm
```

### Step 2: Run your app 
Instead of modifying any code, you simply preload the `kubiq-apm` package when starting your application. It will automatically read your environment variables and begin instrumenting all HTTP, Database, and Framework calls.

*Note: Node.js natively supports sending standard OTLP JSON. You do not need to use the `zipkin` endpoint workaround required for Java.*

```bash
export OTEL_SERVICE_NAME="auth-api"
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="http://localhost:3001/api/apm/v1/traces"

node --require kubiq-apm/auto index.js
```

---

## 2. Python (Django, Flask, FastAPI)

Python relies on the standard `opentelemetry-bootstrap` command to automatically detect and wrap your pip packages (like SQLAlchemy, Requests, Django).

### Step 1: Install Dependencies
```bash
pip install opentelemetry-distro opentelemetry-exporter-otlp
```

### Step 2: Bootstrap Auto-Instrumentation
Run this command once in your virtual environment to download the relevant plugins:
```bash
opentelemetry-bootstrap -a install
```

### Step 3: Run your app with the wrapper
Prefix your normal startup command (like `python manage.py runserver` or `uvicorn`) with the `opentelemetry-instrument` wrapper. 

*Note: The Python OTLP exporter correctly supports HTTP/JSON, so it connects perfectly to the standard `/v1/traces` kubiq endpoint.*

```bash
export OTEL_SERVICE_NAME="my-python-service"
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="http://localhost:3001/api/apm/v1/traces"

# For FastAPI / Uvicorn Server
opentelemetry-instrument uvicorn main:app

# For Django Server
opentelemetry-instrument python manage.py runserver
```

---

## 3. Java (Spring Boot)

Java is incredibly easy to instrument because OpenTelemetry uses the native JVM `-javaagent` capability to inject itself into the bytecode at runtime.

### Step 1: Download the Agent
Download the latest OpenTelemetry Java Agent `.jar` file:
```bash
wget https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar
```

### Step 2: Run your Spring Boot jar
Attach the agent when starting your application. You do not need to modify your `pom.xml` or `build.gradle`.

*Note: Because the Java Agent does not support OTLP JSON (only binary Protobuf), we must configure it to use the `zipkin` JSON exporter instead, which the kubiq Backend natively supports! We also recommend tweaking the batching settings (`bsp.schedule.delay` and `bsp.max.export.batch.size`) to prevent reverse proxy buffer limits.*

```bash
nohup java \
    -javaagent:path/to/opentelemetry-javaagent.jar \
    -Dotel.service.name="my-spring-boot-service" \
    -Dotel.traces.exporter=zipkin \
    -Dotel.exporter.zipkin.endpoint="http://localhost:3001/api/apm/v1/zipkin" \
    -Dotel.metrics.exporter=none \
    -Dotel.logs.exporter=none \
    -Dotel.bsp.schedule.delay=2000 \
    -Dotel.bsp.max.export.batch.size=50 \
    -jar myapp.jar 2>&1 &
```

---

## 4. Next.js 13+ (App Router)

### Step 1: Install Dependencies
```bash
npm install kubiq-apm @vercel/otel
```

### Step 2: Enable config
In your `next.config.js`:
```javascript
module.exports = {
  experimental: {
    instrumentationHook: true,
  },
}
```

### Step 3: Create `instrumentation.ts`
Create this file in the root of your project:
```typescript
import { registerOTel } from '@vercel/otel'

export function register() {
  registerOTel({ 
    serviceName: process.env.OTEL_SERVICE_NAME || 'my-nextjs-app',
    traceExporter: new (require('kubiq-apm/exporter').kubiqExporter)({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    })
  })
}
```
