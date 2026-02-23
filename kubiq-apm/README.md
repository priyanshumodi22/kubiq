# kubiq-apm

The official Node.js APM wrapper for Kubiq. 

This package dramatically simplifies OpenTelemetry instrumentation by bundling all required dependencies, auto-instrumentation modules, and exporters into a single unified package.

## Quick Start (Node.js / Express / Fastify / NestJS)

1. Install the package:
```bash
npm install kubiq-apm
```

2. Start your application by requiring the auto-instrumentation hook:

*Note: Node.js natively supports sending standard OTLP JSON. You do not need to use the `zipkin` endpoint workaround required for Java.*

```bash
export OTEL_SERVICE_NAME="auth-api"
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="http://localhost:3001/api/apm/v1/traces"

node --require kubiq-apm/auto index.js
```

## Advanced Manual Tracing
If you want to manually create custom spans and attach business logic attributes inside your routes, you should **import the OpenTelemetry API directly from `kubiq-apm`**, NOT from `@opentelemetry/api`. 

This guarantees total version compatibility.

```javascript
const { trace } = require('kubiq-apm');

const tracer = trace.getTracer('my-manual-tracer');

app.get('/manual-route', (req, res) => {
    tracer.startActiveSpan('process.payment', (span) => {
        span.setAttributes({
            'custom.user_id': req.user.id,
            'custom.amount': 100
        });

        // Do work...
        span.end();
        res.send('Done');
    });
});
```

## Next.js (App Router) Usage
```bash
npm install kubiq-apm @vercel/otel
```

Create an `instrumentation.ts` in your root:

*Note: The Next.js / @vercel/otel package correctly supports HTTP/JSON, so it connects perfectly to the standard `/v1/traces` Kubiq endpoint.*

```typescript
import { registerOTel } from '@vercel/otel'

export function register() {
  registerOTel({ 
    serviceName: process.env.OTEL_SERVICE_NAME || 'my-next-app',
    traceExporter: new (require('kubiq-apm/exporter').KubiqExporter)({
        url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
    })
  })
}
```
