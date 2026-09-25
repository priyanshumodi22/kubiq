import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check, Code2 } from 'lucide-react';

export interface ApmInstrumentationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type SDKLanguage = 'node' | 'python' | 'go' | 'java';

export function ApmInstrumentationModal({ isOpen, onClose }: ApmInstrumentationModalProps) {
    const [lang, setLang] = useState<SDKLanguage>('node');
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const otlpEndpoint = 'http://<KUBIQ_HOST>:4318/v1/traces';

    const snippets: Record<SDKLanguage, { title: string; filename: string; code: string; install: string }> = {
        node: {
            title: 'Node.js OpenTelemetry Auto-Instrumentation',
            filename: 'tracing.js',
            install: 'npm install --save @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-proto',
            code: `// tracing.js
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');

const sdk = new NodeSDK({
  serviceName: 'my-express-service',
  traceExporter: new OTLPTraceExporter({
    url: '${otlpEndpoint}'
  }),
  instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();
// Start your node app with: node -r ./tracing.js app.js`
        },
        python: {
            title: 'Python OpenTelemetry Instrumentation',
            filename: 'tracing.py',
            install: 'pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-http opentelemetry-instrumentation-fastapi',
            code: `# tracing.py
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import RESOURCE_ATTRIBUTES, Resource

resource = Resource.create({ "service.name": "my-python-service" })
provider = TracerProvider(resource=resource)
processor = BatchSpanProcessor(OTLPSpanExporter(endpoint="${otlpEndpoint}"))
provider.add_span_processor(processor)
trace.set_tracer_provider(provider)

# Run with: opentelemetry-instrument python app.py`
        },
        go: {
            title: 'Go OpenTelemetry Instrumentation',
            filename: 'tracer.go',
            install: 'go get go.opentelemetry.io/otel go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp',
            code: `package main

import (
	"context"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.4.0"
)

func initTracer() (*sdktrace.TracerProvider, error) {
	ctx := context.Background()
	exporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpoint("<KUBIQ_HOST>:4318"),
		otlptracehttp.WithInsecure(),
	)
	if err != nil { return nil, err }

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceNameKey.String("my-go-service"),
		)),
	)
	otel.SetTracerProvider(tp)
	return tp, nil
}`
        },
        java: {
            title: 'Java OpenTelemetry Agent (Zero Code)',
            filename: 'javaagent-flags.sh',
            install: 'wget https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar',
            code: `# Run Java App with OTel Agent:
java -javaagent:opentelemetry-javaagent.jar \\
     -Dotel.service.name=my-java-service \\
     -Dotel.exporter.otlp.endpoint=${otlpEndpoint.replace('/v1/traces', '')} \\
     -Dotel.exporter.otlp.protocol=http/protobuf \\
     -jar my-app.jar`
        }
    };

    const current = snippets[lang];

    const handleCopy = () => {
        navigator.clipboard.writeText(`${current.install}\n\n${current.code}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity" onClick={onClose} />
            <div className="relative w-full max-w-3xl bg-[#111111] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-800 bg-[#161616]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                            <Code2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                Instrument New Service
                            </h3>
                            <p className="text-xs text-gray-400 font-mono">
                                Copy OpenTelemetry SDK snippets to start sending trace spans to Kubiq APM
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-800 bg-[#141414] px-5 gap-2 pt-3">
                    {[
                        { id: 'node', label: 'Node.js' },
                        { id: 'python', label: 'Python' },
                        { id: 'go', label: 'Go' },
                        { id: 'java', label: 'Java' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setLang(tab.id as SDKLanguage)}
                            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors border-b-2 ${lang === tab.id ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Code Body */}
                <div className="p-6 overflow-y-auto space-y-4 font-mono text-xs custom-scrollbar flex-1">
                    <div className="space-y-1">
                        <span className="text-gray-400 text-[10px] uppercase tracking-wider font-bold">1. Package Installation</span>
                        <div className="bg-black/40 border border-gray-800 rounded-lg p-3 text-cyan-400 flex items-center justify-between">
                            <span>{current.install}</span>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400 text-[10px] uppercase tracking-wider font-bold">2. Tracing Configuration ({current.filename})</span>
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded text-[11px] font-semibold transition-all"
                            >
                                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? 'Copied Code' : 'Copy Snippet'}
                            </button>
                        </div>
                        <pre className="bg-[#181818] border border-gray-800 rounded-xl p-4 text-gray-200 overflow-x-auto text-[11px] leading-relaxed">
                            {current.code}
                        </pre>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-4 border-t border-gray-800 bg-[#161616]">
                    <span className="text-[11px] text-gray-500 font-mono">
                        OTLP HTTP Collector listening on <span className="text-primary font-bold">:4318/v1/traces</span>
                    </span>
                    <button onClick={onClose} className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-medium transition-colors">
                        Close
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
