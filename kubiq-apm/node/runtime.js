const { getRuntime, setRuntime } = require('./runtime-state');
const { BoundedProcessor } = require('./runtime-processor');
const spans = require('./runtime-spans');
const noop = { enabled: false, forceFlush: async () => {}, shutdown: async () => {}, diagnostics: () => ({ queued: 0, pending: 0, exported: 0, failed: 0, dropped: 0 }) };
function configuration(options) {
    const endpoint = options.endpoint || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    const token = options.token || process.env.KUBIQ_INGESTION_TOKEN;
    const serviceName = options.serviceName || process.env.OTEL_SERVICE_NAME;
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || !token || !serviceName) throw new Error('Invalid tracing configuration');
    return { endpoint, token, serviceName };
}
function startTracing(options = {}) {
    if (getRuntime()) return getRuntime().handle;
    if (!(options.enabled ?? process.env.KUBIQ_TRACING_ENABLED === 'true') || process.env.OTEL_SDK_DISABLED === 'true') return noop;
    try { return initialize(options, configuration(options)); }
    catch { console.warn('[kubiq-apm] tracing_configuration_invalid'); return noop; }
}
function initialize(options, config) {
    const api = require('@opentelemetry/api');
    const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
    const { AlwaysOnSampler } = require('@opentelemetry/sdk-trace-base');
    const { Resource } = require('@opentelemetry/resources');
    const { AsyncLocalStorageContextManager } = require('@opentelemetry/context-async-hooks');
    const { W3CTraceContextPropagator } = require('@opentelemetry/core');
    const { KubiqExporter } = require('./exporter');
    const exporter = new KubiqExporter({ url: config.endpoint, headers: { Authorization: 'Bearer ' + config.token }, timeoutMillis: 5000 });
    const processor = new BoundedProcessor(exporter, { transform: require('./runtime-policy').safeSpan });
    const provider = new NodeTracerProvider({ resource: new Resource({ 'service.name': config.serviceName, 'service.version': options.serviceVersion || 'unknown' }), sampler: new AlwaysOnSampler(), spanLimits: { attributeCountLimit: 32, attributeValueLengthLimit: 4096, eventCountLimit: 0 } });
    provider.addSpanProcessor(processor);
    provider.register({ contextManager: new AsyncLocalStorageContextManager().enable(), propagator: new W3CTraceContextPropagator() });
    const runtime = { api, processor, provider, profile: options.profile || 'kubiq', tracer: api.trace.getTracer('kubiq-apm/runtime', '1.1.1'), scopeKey: api.createContextKey('kubiq-live-request'), stopping: false };
    runtime.handle = { enabled: true, forceFlush: () => processor.forceFlush(), diagnostics: () => processor.counts(), shutdown: () => shutdown(runtime) };
    setRuntime(runtime);
    const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
    const { registerInstrumentations } = require('@opentelemetry/instrumentation');
    const exportPath = new URL(config.endpoint).pathname;
    const transport = new HttpInstrumentation({
        ignoreIncomingRequestHook: () => true,
        requireParentforOutgoingSpans: true,
        ignoreOutgoingRequestHook: request => !api.context.active().getValue(runtime.scopeKey)?.active || request.path?.split('?')[0] === exportPath,
    });
    registerInstrumentations({ instrumentations: [transport] });
    require('node:http');
    require('node:https');
    runtime.transport = transport;
    return runtime.handle;
}
function shutdown(runtime) {
    if (runtime.shutdownPromise) return runtime.shutdownPromise;
    runtime.stopping = true;
    runtime.transport.disable();
    runtime.shutdownPromise = runtime.provider.shutdown();
    return runtime.shutdownPromise;
}
exports.startTracing = startTracing;
exports.traceRequest = spans.traceRequest;
exports.traceDependency = spans.traceDependency;
exports.withoutTracing = spans.withoutTracing;
exports.beginDependency = spans.beginDependency;
exports.databaseQueryDetails = require('./runtime-query').databaseQueryDetails;
