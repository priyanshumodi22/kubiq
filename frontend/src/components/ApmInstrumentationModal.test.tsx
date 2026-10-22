// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from 'js-yaml';
import { ApmInstrumentationModal } from './ApmInstrumentationModal';
import { COLLECTOR_CONFIG, INSTRUMENTATION_SNIPPETS } from '../utils/apmInstrumentation';

const mocks = vi.hoisted(() => ({ error: vi.fn(), copy: vi.fn() }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ error: mocks.error }) }));
beforeEach(() => { vi.clearAllMocks(); mocks.copy.mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.copy } }); });
afterEach(cleanup);

describe('APM instrumentation wire-format guidance', () => {
  it('keeps Java shell continuations as one literal backslash per line', () => {
    expect(INSTRUMENTATION_SNIPPETS.java.code).toContain('\\\n');
    expect(INSTRUMENTATION_SNIPPETS.java.code).not.toContain('\\\\\n');
  });
  it('uses JSON and ingestion authentication for the direct Node endpoint', () => {
    const snippet = INSTRUMENTATION_SNIPPETS.node;
    expect(snippet.install).toContain('@opentelemetry/exporter-trace-otlp-http');
    expect(snippet.code).toContain("require('@opentelemetry/exporter-trace-otlp-http')");
    expect(snippet.code).toContain('process.env.KUBIQ_INGESTION_TOKEN');
    expect(snippet.code).toContain('Authorization:');
    expect(snippet.code).not.toContain(':4318');
  });
  it('provides a private Collector receiver and authenticated JSON forwarding', () => {
    const config = load(COLLECTOR_CONFIG) as { receivers: { otlp: { protocols: { http: { endpoint: string } } } }; exporters: Record<string, { encoding: string; compression: string; traces_endpoint: string; headers: { Authorization: string } }> };
    expect(config.receivers.otlp.protocols.http.endpoint).toBe('127.0.0.1:4318');
    expect(config.exporters['otlp_http/kubiq']).toEqual({ encoding: 'json', compression: 'none', traces_endpoint: '${env:KUBIQ_TRACES_ENDPOINT}', headers: { Authorization: 'Bearer ${env:KUBIQ_INGESTION_TOKEN}' } });
  });
  it('copies the required bridge alongside protobuf SDK instructions', async () => {
    const view = render(<ApmInstrumentationModal isOpen onClose={vi.fn()} />);
    fireEvent.click(view.getByRole('button', { name: 'Python' }));
    expect(view.getByRole('heading', { name: '3. Required local Collector configuration' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Copy Snippet' }));
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith(expect.stringContaining(COLLECTOR_CONFIG)));
    expect(view.getByRole('button', { name: 'Copied Code' })).toBeTruthy();
  });
  it('reports clipboard failure using the kubiq toast without claiming a copy', async () => {
    mocks.copy.mockRejectedValue(new Error('Denied'));
    const view = render(<ApmInstrumentationModal isOpen onClose={vi.fn()} />);
    fireEvent.click(view.getByRole('button', { name: 'Copy Snippet' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(view.queryByRole('button', { name: 'Copied Code' })).toBeNull();
  });
});
