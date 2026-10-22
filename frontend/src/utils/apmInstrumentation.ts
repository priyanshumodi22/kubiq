export type SDKLanguage = 'node' | 'python' | 'go' | 'java';
interface InstrumentationSnippet { title: string; filename: string; code: string; install: string }

// kubiq receives JSON on its API port. A separately operated Collector converts
// protobuf-only SDKs; it is not a listener installed by the kubiq server.
export const COLLECTOR_CONFIG = `# collector.yaml (run beside your application, not on a public interface)
# Set KUBIQ_TRACES_ENDPOINT to the full HTTPS URL including any backend context:
# https://<KUBIQ_HOST><BACKEND_CONTEXT_PATH>/api/apm/v1/traces
# Set KUBIQ_INGESTION_TOKEN securely in the Collector environment.
receivers:
  otlp:
    protocols:
      http:
        endpoint: 127.0.0.1:4318
processors:
  batch:
    send_batch_size: 50
    send_batch_max_size: 50
exporters:
  otlp_http/kubiq:
    traces_endpoint: \${env:KUBIQ_TRACES_ENDPOINT}
    encoding: json
    compression: none
    headers:
      Authorization: Bearer \${env:KUBIQ_INGESTION_TOKEN}
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp_http/kubiq]
# Older Collector releases call this exporter otlphttp instead of otlp_http.
# Validate against your installed Collector before starting it.
`;

export const INSTRUMENTATION_SNIPPETS: Record<SDKLanguage, InstrumentationSnippet> = {
  node: {
    title: 'Node.js OpenTelemetry Auto-Instrumentation', filename: 'tracing.cjs',
    install: 'npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http',
    code: `// tracing.cjs: this exporter sends OTLP HTTP JSON, not protobuf.
// Set OTEL_EXPORTER_OTLP_TRACES_ENDPOINT to:
// https://<KUBIQ_HOST><BACKEND_CONTEXT_PATH>/api/apm/v1/traces
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
const token = process.env.KUBIQ_INGESTION_TOKEN;
if (!endpoint || !token) throw new Error('Configure the kubiq endpoint and ingestion token');
const sdk = new NodeSDK({
  serviceName: 'my-node-service',
  traceExporter: new OTLPTraceExporter({ url: endpoint, headers: { Authorization: 'Bearer ' + token } }),
  instrumentations: [getNodeAutoInstrumentations()]
});
sdk.start();
process.on('SIGTERM', () => { sdk.shutdown().catch(console.error); });
// Start with: node --require ./tracing.cjs app.js`,
  },
  python: {
    title: 'Python via a local OpenTelemetry Collector', filename: 'tracing.py',
    install: 'pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-http',
    code: `# Start the Collector below first; it converts protobuf to kubiq HTTP JSON.
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

provider = TracerProvider(resource=Resource.create({"service.name": "my-python-service"}))
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
    endpoint="http://127.0.0.1:4318/v1/traces")))
trace.set_tracer_provider(provider)
# Import before your app; install the matching framework instrumentation separately.
# This synthetic span verifies the path without an instrumented k3s workload.
with trace.get_tracer(__name__).start_as_current_span("kubiq-smoke-test"):
    pass
provider.force_flush()
provider.shutdown()`,
  },
  go: {
    title: 'Go via a local OpenTelemetry Collector', filename: 'tracer.go',
    install: 'go get go.opentelemetry.io/otel go.opentelemetry.io/otel/sdk go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp',
    code: `package main
import (
  "context"
  "go.opentelemetry.io/otel"
  "go.opentelemetry.io/otel/attribute"
  "go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
  "go.opentelemetry.io/otel/sdk/resource"
  sdktrace "go.opentelemetry.io/otel/sdk/trace"
)
// Start the Collector below first. WithInsecure applies only to loopback.
func initTracer(ctx context.Context) (*sdktrace.TracerProvider, error) {
  exporter, err := otlptracehttp.New(ctx, otlptracehttp.WithEndpoint("127.0.0.1:4318"), otlptracehttp.WithInsecure())
  if err != nil { return nil, err }
  provider := sdktrace.NewTracerProvider(sdktrace.WithBatcher(exporter),
    sdktrace.WithResource(resource.NewWithAttributes("", attribute.String("service.name", "my-go-service"))))
  otel.SetTracerProvider(provider)
  return provider, nil
}
// Call provider.Shutdown(ctx) on graceful exit to flush pending spans.`,
  },
  java: {
    title: 'Java agent via a local OpenTelemetry Collector', filename: 'javaagent-flags.sh',
    install: 'Download opentelemetry-javaagent.jar from the official OpenTelemetry Java instrumentation releases and verify its checksum.',
    code: String.raw`# Start the Collector below first; kubiq itself does not expose port 4318.
java -javaagent:opentelemetry-javaagent.jar \
  -Dotel.service.name=my-java-service \
  -Dotel.traces.exporter=otlp \
  -Dotel.metrics.exporter=none \
  -Dotel.logs.exporter=none \
  -Dotel.exporter.otlp.traces.endpoint=http://127.0.0.1:4318/v1/traces \
  -Dotel.exporter.otlp.protocol=http/protobuf \
  -jar my-app.jar`,
  },
};
