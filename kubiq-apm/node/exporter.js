const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

// Provide an easy-to-use exporter specifically for Next.js and custom setups
// that need to initialize their own Tracing Providers.

class KubiqExporter extends OTLPTraceExporter {
    constructor(config = {}) {
        const environmentHeaders = Object.fromEntries(
            (process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS || process.env.OTEL_EXPORTER_OTLP_HEADERS || '')
                .split(',')
                .map((header) => {
                    const separator = header.indexOf('=');
                    return separator === -1
                        ? []
                        : [header.slice(0, separator).trim(), header.slice(separator + 1).trim()];
                })
                .filter(([key, value]) => key && value)
        );
        const kubiqConfig = {
            url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:3001/api/apm/v1/traces',
            headers: process.env.KUBIQ_INGESTION_TOKEN
                ? { Authorization: 'Bearer ' + process.env.KUBIQ_INGESTION_TOKEN, ...environmentHeaders }
                : environmentHeaders,
            ...config
        };
        super(kubiqConfig);
    }
}

module.exports = {
    KubiqExporter
};
