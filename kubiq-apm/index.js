const api = require('@opentelemetry/api');

// Re-export the OpenTelemetry API cleanly so that whenever a user needs
// to manually trace or attach semantic attributes, they import `kubiq-apm`
// instead of `@opentelemetry/api`, ensuring exact version alignment.

module.exports = {
    ...api,

    // You can add additional high-level Kubiq helpers here in the future
    // e.g., createKubiqSpan(), injectCustomTraceId(), etc.
};
