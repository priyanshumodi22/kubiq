const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

// Provide an easy-to-use exporter specifically for Next.js and custom setups
// that need to initialize their own Tracing Providers.

class KubiqExporter extends OTLPTraceExporter {
    constructor(config = {}) {
        const kubiqConfig = {
            url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:3001/api/apm/v1/traces',
            ...config
        };
        super(kubiqConfig);
    }
}

module.exports = {
    KubiqExporter
};
