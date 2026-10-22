import os
import sys

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "install":
        print("[kubiq-apm] Installing Python auto-instrumentation dependencies...")
        try:
            from opentelemetry.instrumentation.bootstrap import run  # type: ignore
            sys.argv = ["opentelemetry-bootstrap", "-a", "install"]
            run()
        except ImportError:
            print("[kubiq-apm] Error: 'opentelemetry-bootstrap' not found. Did you install kubiq-apm correctly?")
            sys.exit(1)
        return

    print("[kubiq-apm] Initializing Python Auto-Instrumentation...")
    
    # The bundled Python exporter sends protobuf. A separately configured local
    # Collector converts it to kubiq's HTTP JSON wire format.
    if "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT" not in os.environ:
        os.environ["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"] = "http://127.0.0.1:4318/v1/traces"
    
    if "OTEL_SERVICE_NAME" not in os.environ:
        os.environ["OTEL_SERVICE_NAME"] = "unknown-python-service"
        
    if "OTEL_TRACES_EXPORTER" not in os.environ:
        os.environ["OTEL_TRACES_EXPORTER"] = "otlp"
        
    if "OTEL_EXPORTER_OTLP_PROTOCOL" not in os.environ:
        os.environ["OTEL_EXPORTER_OTLP_PROTOCOL"] = "http/protobuf"

    os.environ.setdefault("OTEL_METRICS_EXPORTER", "none")
    os.environ.setdefault("OTEL_LOGS_EXPORTER", "none")

    endpoint = os.environ["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"]
    protocol = os.environ.get("OTEL_EXPORTER_OTLP_TRACES_PROTOCOL", os.environ["OTEL_EXPORTER_OTLP_PROTOCOL"])
    if "/api/apm/v1/traces" in endpoint and protocol != "http/json":
        print("[kubiq-apm] kubiq accepts HTTP JSON, not protobuf. Configure a local Collector with encoding: json and point this SDK at that Collector. See the package README.")
        sys.exit(1)
        
    # Apply conservative batch limits
    if "OTEL_BSP_MAX_EXPORT_BATCH_SIZE" not in os.environ:
        os.environ["OTEL_BSP_MAX_EXPORT_BATCH_SIZE"] = "50"
    if "OTEL_BSP_SCHEDULE_DELAY" not in os.environ:
        os.environ["OTEL_BSP_SCHEDULE_DELAY"] = "2000"

    print(f"[kubiq-apm] Connecting to {os.environ['OTEL_EXPORTER_OTLP_TRACES_ENDPOINT']} as '{os.environ['OTEL_SERVICE_NAME']}'")
    
    try:
        from opentelemetry.instrumentation.auto_instrumentation import run  # type: ignore
    except ImportError:
        print("[kubiq-apm] Error: 'opentelemetry-instrument' not found. Please run 'kubiq-apm install' first.")
        sys.exit(1)
        
    # Replace sys.argv for the underlying run() command
    sys.argv = ["opentelemetry-instrument"] + sys.argv[1:]
    
    # Run the native OpenTelemetry auto-instrumentor programmatically
    run()

if __name__ == "__main__":
    main()
