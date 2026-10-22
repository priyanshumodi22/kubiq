import type { ISpan } from '../database/interfaces/ITraceRepository';

export class OtlpPayloadError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OtlpPayloadError('Expected an OTLP object');
  return value as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new OtlpPayloadError('Expected an OTLP array');
  return value;
}

function attributes(value: unknown): Record<string, unknown> {
  const entries = list(value).map(attribute => {
    const entry = record(attribute);
    if (typeof entry.key !== 'string' || !entry.value) return [];
    const encoded = record(entry.value);
    const first = Object.keys(encoded)[0];
    return first ? [entry.key, encoded[first]] : [];
  }).filter(entry => entry.length === 2);
  return Object.fromEntries(entries);
}

function timestamp(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') throw new OtlpPayloadError('Missing span timestamp');
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new OtlpPayloadError('Invalid span timestamp');
  return result;
}

function spanRecord(value: unknown, serviceName: string): ISpan {
  const span = record(value);
  if (typeof span.traceId !== 'string' || typeof span.spanId !== 'string' || typeof span.name !== 'string') {
    throw new OtlpPayloadError('Missing span identity or name');
  }
  const start = timestamp(span.startTimeUnixNano);
  const end = timestamp(span.endTimeUnixNano);
  if (end < start) throw new OtlpPayloadError('Span ends before it starts');
  const status = span.status ? record(span.status).code : 0;
  return {
    traceId: span.traceId, spanId: span.spanId, name: span.name, serviceName,
    parentSpanId: typeof span.parentSpanId === 'string' && span.parentSpanId ? span.parentSpanId : null,
    kind: typeof span.kind === 'string' || typeof span.kind === 'number' ? span.kind : undefined,
    startTimeUnixNano: start, endTimeUnixNano: end, durationMs: (end - start) / 1_000_000,
    statusCode: typeof status === 'number' ? status : 0,
    attributes: attributes(span.attributes),
  };
}

function resourceServiceName(resourceSpan: Record<string, unknown>): string {
  if (!resourceSpan.resource) return 'unknown-service';
  const value = attributes(record(resourceSpan.resource).attributes)['service.name'];
  return typeof value === 'string' && value ? value : 'unknown-service';
}

function scopeRecords(value: unknown): unknown[] {
  return list(value).flatMap(scope => list(record(scope).spans));
}

/** Bound the flattened batch before allocating normalized records or enqueueing. */
export function parseOtlpPayload(payload: unknown, limit: number): ISpan[] {
  if (!payload) return [];
  const spans: ISpan[] = [];
  for (const rawResource of list(record(payload).resourceSpans)) {
    const resource = record(rawResource);
    const serviceName = resourceServiceName(resource);
    const records = scopeRecords(resource.scopeSpans);
    if (spans.length + records.length > limit) throw new OtlpPayloadError('APM batch is too large', 413);
    spans.push(...records.map(value => spanRecord(value, serviceName)));
  }
  return spans;
}

export function matchesIgnoredRoute(span: ISpan, ignoredPaths: string[]): boolean {
  const target: unknown = span.attributes?.['http.target'];
  return ignoredPaths.some(path => span.name.includes(path) || (typeof target === 'string' && target.includes(path)));
}
