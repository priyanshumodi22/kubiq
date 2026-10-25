import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("kubiq_wrapper", Path(__file__).parent / "kubiq_apm" / "__main__.py")
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)


class WrapperCompatibilityTests(unittest.TestCase):
    def run_wrapper(self, environment):
        observed = {}
        runner = types.ModuleType("opentelemetry.instrumentation.auto_instrumentation")
        runner.run = lambda: observed.update(os.environ)
        with patch.dict(os.environ, environment, clear=True), patch.object(sys, "argv", ["kubiq-apm", "python", "app.py"]), patch.dict(sys.modules, {runner.__name__: runner}):
            wrapper.main()
        return observed

    def test_default_targets_private_collector_and_disables_unconfigured_signals(self):
        environment = self.run_wrapper({})
        self.assertEqual(environment["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"], "http://127.0.0.1:4318/v1/traces")
        self.assertEqual(environment["OTEL_EXPORTER_OTLP_PROTOCOL"], "http/protobuf")
        self.assertEqual(environment["OTEL_METRICS_EXPORTER"], "none")
        self.assertEqual(environment["OTEL_LOGS_EXPORTER"], "none")

    def test_explicit_collector_endpoint_headers_and_batch_settings_are_preserved(self):
        supplied = {"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": "https://collector.example.test/v1/traces", "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Bearer fixture-only", "OTEL_BSP_MAX_EXPORT_BATCH_SIZE": "25"}
        environment = self.run_wrapper(supplied)
        for key, value in supplied.items():
            self.assertEqual(environment[key], value)

    def test_direct_protobuf_configuration_fails_explicitly(self):
        with self.assertRaises(SystemExit) as result:
            self.run_wrapper({"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": "https://kubiq.example.test/api/apm/v1/traces"})
        self.assertEqual(result.exception.code, 1)

    def test_protocol_string_cannot_enable_an_uninstalled_json_exporter(self):
        with self.assertRaises(SystemExit):
            self.run_wrapper({"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": "https://kubiq.example.test/api/apm/v1/traces", "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json"})


if __name__ == "__main__":
    unittest.main()
