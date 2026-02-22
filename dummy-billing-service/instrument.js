const opentelemetry = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

// Configure the exporter to send traces to Kubiq
const traceExporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:3001/api/apm/v1/traces', // Kubiq APM endpoint
});

const sdk = new opentelemetry.NodeSDK({
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
    serviceName: 'dummy-billing-service',
});

// Initialize the SDK and start the app
sdk.start();

console.log('OpenTelemetry initialized. Starting app...');
require('./app.js');
