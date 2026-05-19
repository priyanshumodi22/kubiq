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
    
    # Set default environment variables for kubiq if not provided
    if "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT" not in os.environ:
        os.environ["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"] = "http://localhost:3001/api/apm/v1/traces"
    
    if "OTEL_SERVICE_NAME" not in os.environ:
        os.environ["OTEL_SERVICE_NAME"] = "unknown-python-service"
        
    if "OTEL_TRACES_EXPORTER" not in os.environ:
        os.environ["OTEL_TRACES_EXPORTER"] = "otlp"
        
    if "OTEL_EXPORTER_OTLP_PROTOCOL" not in os.environ:
        os.environ["OTEL_EXPORTER_OTLP_PROTOCOL"] = "http/protobuf"
        
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
