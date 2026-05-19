const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

// This script is meant to be run via `--require kubiq-apm/auto`
console.log('[kubiq-apm] Initializing Auto-Instrumentation...');

// Apply conservative batch limits to prevent reverse proxy buffer truncations (Z_BUF_ERROR)
process.env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE = process.env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE || '50';
process.env.OTEL_BSP_SCHEDULE_DELAY = process.env.OTEL_BSP_SCHEDULE_DELAY || '2000';

const exporterUrl = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:3001/api/apm/v1/traces';
const serviceName = process.env.OTEL_SERVICE_NAME || 'unknown-node-service';

const traceExporter = new OTLPTraceExporter({
    url: exporterUrl,
});

const sdk = new opentelemetry.NodeSDK({
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
    serviceName: serviceName,
});

// Graceful shutdown
process.on('SIGTERM', () => {
    sdk.shutdown()
        .then(() => console.log('[kubiq-apm] Tracing terminated'))
        .catch((error) => console.log('[kubiq-apm] Error terminating tracing', error))
        .finally(() => process.exit(0));
});

try {
    sdk.start();
    console.log(`[kubiq-apm] Successfully connected to ${exporterUrl} as '${serviceName}'`);
} catch (err) {
    console.error(`[kubiq-apm] Failed to start tracer:`, err);
}
