const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { KubiqExporter } = require('./exporter');

// This script is meant to be run via `--require kubiq-apm/auto`
console.log('[kubiq-apm] Initializing Auto-Instrumentation...');

// Apply conservative batch limits to prevent reverse proxy buffer truncations (Z_BUF_ERROR)
process.env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE = process.env.OTEL_BSP_MAX_EXPORT_BATCH_SIZE || '50';
process.env.OTEL_BSP_SCHEDULE_DELAY = process.env.OTEL_BSP_SCHEDULE_DELAY || '2000';

const exporterUrl = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:3001/api/apm/v1/traces';
const serviceName = process.env.OTEL_SERVICE_NAME || 'unknown-node-service';

const traceExporter = new KubiqExporter({
    url: exporterUrl,
});

const sdk = new opentelemetry.NodeSDK({
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
    serviceName: serviceName,
});

// Flush once for service termination and interactive Ctrl+C.
let shutdownStarted = false;
const shutdownTracing = () => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    sdk.shutdown()
        .then(() => console.log('[kubiq-apm] Tracing terminated'))
        .catch((error) => console.log('[kubiq-apm] Error terminating tracing', error))
        .finally(() => process.exit(0));
};
process.on('SIGTERM', shutdownTracing);
process.on('SIGINT', shutdownTracing);

try {
    sdk.start();
    console.log(`[kubiq-apm] Instrumentation started; exporting to ${exporterUrl} as '${serviceName}'`);
} catch (err) {
    console.error(`[kubiq-apm] Failed to start tracer:`, err);
}
