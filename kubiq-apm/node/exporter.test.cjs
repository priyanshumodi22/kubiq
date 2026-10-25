const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function loadExporter(environment) {
  const observed = [];
  class JsonExporter { constructor(config) { this.config = config; observed.push(config); } }
  const context = {
    module: { exports: {} }, process: { env: { ...environment } },
    require(name) {
      assert.equal(name, '@opentelemetry/exporter-trace-otlp-http');
      return { OTLPTraceExporter: JsonExporter };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'exporter.js'), 'utf8'), context);
  return { Exporter: context.module.exports.KubiqExporter, observed };
}

test('Node JSON exporter honors per-signal endpoint and headers over generic values', () => {
  const { Exporter, observed } = loadExporter({
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://kubiq.example.test/prefix/api/apm/v1/traces',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'https://generic.example.test',
    OTEL_EXPORTER_OTLP_TRACES_HEADERS: 'Authorization=Bearer fixture==, X-Trace=one,malformed',
    OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=wrong',
  });
  new Exporter();
  assert.equal(observed[0].url, 'https://kubiq.example.test/prefix/api/apm/v1/traces');
  assert.deepEqual(JSON.parse(JSON.stringify(observed[0].headers)), { Authorization: 'Bearer fixture==', 'X-Trace': 'one' });
});

test('explicit exporter configuration preserves the public override contract', () => {
  const { Exporter, observed } = loadExporter({ OTEL_EXPORTER_OTLP_ENDPOINT: 'https://generic.example.test', OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=fixture' });
  new Exporter({ url: 'https://override.example.test/v1/traces', headers: { 'x-custom': 'override' } });
  assert.equal(observed[0].url, 'https://override.example.test/v1/traces');
  assert.deepEqual(JSON.parse(JSON.stringify(observed[0].headers)), { 'x-custom': 'override' });
});

test('token convenience supports authenticated setup but standard headers retain precedence', () => {
  const { Exporter, observed } = loadExporter({ KUBIQ_INGESTION_TOKEN: 'fixture-only' });
  new Exporter();
  assert.equal(observed[0].headers.Authorization, 'Bearer fixture-only');
  const custom = loadExporter({ KUBIQ_INGESTION_TOKEN: 'fallback', OTEL_EXPORTER_OTLP_TRACES_HEADERS: 'Authorization=Bearer explicit' });
  new custom.Exporter();
  assert.equal(custom.observed[0].headers.Authorization, 'Bearer explicit');
});

test('auto instrumentation uses the same JSON exporter and registers graceful shutdown', async () => {
  const { Exporter } = loadExporter({ OTEL_EXPORTER_OTLP_HEADERS: 'Authorization=fixture' });
  const signals = new Map();
  let sdk;
  class NodeSDK {
    constructor(config) { this.config = config; sdk = this; }
    start() { this.started = true; }
    async shutdown() { this.stopped = true; }
  }
  const context = {
    process: { env: { OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'https://kubiq.example.test/api/apm/v1/traces', OTEL_SERVICE_NAME: 'fixture' }, on: (signal, callback) => signals.set(signal, callback), exit: () => {} },
    console: { log() {}, error() {} },
    require(name) {
      if (name === '@opentelemetry/sdk-node') return { NodeSDK };
      if (name === '@opentelemetry/auto-instrumentations-node') return { getNodeAutoInstrumentations: () => ['fixture'] };
      assert.equal(name, './exporter');
      return { KubiqExporter: Exporter };
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'auto.js'), 'utf8'), context);
  assert.equal(sdk.started, true);
  assert.equal(sdk.config.traceExporter.config.url, 'https://kubiq.example.test/api/apm/v1/traces');
  assert.equal(sdk.config.traceExporter.config.headers.Authorization, 'fixture');
  signals.get('SIGTERM')();
  await Promise.resolve();
  assert.equal(sdk.stopped, true);
});
