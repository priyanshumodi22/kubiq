// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ApmDashboard from './ApmDashboard';

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(), getTraces: vi.fn(), fetchTrace: vi.fn(), clearTrace: vi.fn(), refresh: vi.fn(), fetchMap: vi.fn(),
  metrics: [] as Array<{ serviceName: string; requestCount: number; errorCount: number; avgDurationMs: number; p95DurationMs: number; rpm: number; errorRate: number }>,
  loading: false, error: null as string | null, canExport: true, exportSpans: vi.fn(),
}));
vi.mock('../services/api', () => ({ apiClient: { getApmStatus: mocks.getStatus, getApmServiceTraces: mocks.getTraces, exportApmSpans: mocks.exportSpans } }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: (permission: string) => permission !== 'apm.export' || mocks.canExport }) }));
vi.mock('../hooks/useApm', () => ({ useApm: () => ({ metrics: mocks.metrics, loading: mocks.loading, error: mocks.error, refresh: mocks.refresh }) }));
vi.mock('../hooks/useTrace', () => ({ useTrace: () => ({ spans: [], loading: false, error: null, fetchTrace: mocks.fetchTrace, clearTrace: mocks.clearTrace }) }));
vi.mock('../hooks/useServiceMap', () => ({ useServiceMap: () => ({ dependencies: [], loading: false, error: null, fetchServiceMap: mocks.fetchMap }) }));
vi.mock('../components/TraceWaterfall', () => ({ default: () => <div>Trace waterfall</div> }));
vi.mock('../components/ServiceMap', () => ({ default: () => <div>Topology canvas</div> }));
vi.mock('../components/ApmConfigModal', () => ({ ApmConfigModal: () => null }));
vi.mock('../components/ApmInstrumentationModal', () => ({ ApmInstrumentationModal: () => null }));
vi.mock('../components/TimeRangeSlider', () => ({ TimeRangeSlider: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.metrics = [];
  mocks.loading = false;
  mocks.error = null;
  mocks.canExport = true;
  mocks.getStatus.mockResolvedValue({ supported: true, dbType: 'mysql' });
  mocks.getTraces.mockResolvedValue([]);
  mocks.exportSpans.mockResolvedValue({ data: 'fixture,csv', headers: { 'content-disposition': 'attachment; filename="fixture.csv"' } });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('APM dashboard characterization', () => {
  it('fetches once on service selection and applies filters to the latest inspector without reselecting a trace', async () => {
    mocks.metrics = ['payments', 'inventory'].map(serviceName => ({ serviceName, requestCount: 20, errorCount: 0, avgDurationMs: 10, p95DurationMs: 20, rpm: 2, errorRate: 0 }));
    mocks.getTraces.mockResolvedValue([{ traceId: 'trace-a', name: 'GET /pay', durationMs: 12, startTimeUnixNano: 1000000, statusCode: 0 }]);
    const view = render(<ApmDashboard />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Inspect payments' })).toBeTruthy());
    fireEvent.click(view.getByRole('button', { name: 'Inspect payments' }));
    await waitFor(() => expect(mocks.fetchTrace).toHaveBeenCalledTimes(1));
    expect(mocks.getTraces).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole('button', { name: 'Errors Only' }));
    await waitFor(() => expect(mocks.getTraces).toHaveBeenCalledTimes(2));
    expect(mocks.getTraces).toHaveBeenLastCalledWith('payments', expect.objectContaining({ errorOnly: 'true' }));
    expect(mocks.fetchTrace).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByText('Back to Overview'));
    fireEvent.click(view.getByRole('button', { name: 'Inspect inventory' }));
    await waitFor(() => expect(mocks.fetchTrace).toHaveBeenCalledTimes(2));
    expect(mocks.getTraces).toHaveBeenCalledTimes(3);
    fireEvent.change(view.getByPlaceholderText('Filter by attribute (e.g. /checkout)...'), { target: { value: '/stock' } });
    await waitFor(() => expect(mocks.getTraces).toHaveBeenCalledTimes(4));
    expect(mocks.getTraces).toHaveBeenLastCalledWith('inventory', expect.objectContaining({ search: '/stock' }));
    expect(mocks.fetchTrace).toHaveBeenCalledTimes(2);
  });

  it('renders configuration loading before the supported empty state', async () => {
    const view = render(<ApmDashboard />);
    expect(view.getByText('Analyzing system configuration...')).toBeTruthy();
    await waitFor(() => expect(view.getByText('No Service Data Found')).toBeTruthy());
  });

  it('keeps unsupported adapters out of the telemetry interface', async () => {
    mocks.getStatus.mockResolvedValue({ supported: false, dbType: 'json' });
    const view = render(<ApmDashboard />);
    await waitFor(() => expect(view.getByText('APM is Disabled (json mode)')).toBeTruthy());
    expect(view.queryByPlaceholderText('Search Service (e.g. auth-api)')).toBeNull();
  });

  it('prioritizes metric failures over loading and empty results', async () => {
    mocks.error = 'Metrics unavailable';
    mocks.loading = true;
    const view = render(<ApmDashboard />);
    await waitFor(() => expect(view.getByText('Metrics unavailable')).toBeTruthy());
    expect(view.queryByText('Aggregating traces...')).toBeNull();
    expect(view.queryByText('No Service Data Found')).toBeNull();
  });

  it('opens a service, auto-selects its trace, and returns to overview', async () => {
    mocks.metrics = [{ serviceName: 'payments', requestCount: 20, errorCount: 0, avgDurationMs: 10, p95DurationMs: 20, rpm: 2, errorRate: 0 }];
    mocks.getTraces.mockResolvedValue([{ traceId: 'trace-a', name: 'GET /pay', durationMs: 12, startTimeUnixNano: 1000000, statusCode: 0 }]);
    const view = render(<ApmDashboard />);
    await waitFor(() => expect(view.getByText('payments')).toBeTruthy());
    fireEvent.click(view.getByRole('button', { name: 'Inspect payments' }));
    await waitFor(() => expect(mocks.fetchTrace).toHaveBeenCalledWith('trace-a'));
    expect(mocks.getTraces).toHaveBeenCalledWith('payments', expect.objectContaining({ fromMs: expect.any(String), toMs: expect.any(String) }));
    expect(view.getByText('Trace Inspector (payments)')).toBeTruthy();
    fireEvent.click(view.getByText('Back to Overview'));
    expect(mocks.clearTrace).toHaveBeenCalled();
    expect(view.getByText('Monitoring Overviews')).toBeTruthy();
  });

  it('distinguishes a filtered-out service from absent telemetry', async () => {
    mocks.metrics = [{ serviceName: 'payments', requestCount: 20, errorCount: 0, avgDurationMs: 10, p95DurationMs: 20, rpm: 2, errorRate: 0 }];
    const view = render(<ApmDashboard />);
    await waitFor(() => expect(view.getByText('payments')).toBeTruthy());
    fireEvent.change(view.getByPlaceholderText('Search Service (e.g. auth-api)'), { target: { value: 'missing' } });
    expect(view.getByText('No Matching Services')).toBeTruthy();
    expect(view.queryByText('No Service Data Found')).toBeNull();
  });

  it('keeps refresh available but hides export without apm.export', async () => {
    mocks.canExport = false;
    const view = render(<ApmDashboard />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Refresh' })).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Export' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Refresh' }));
    expect(mocks.refresh).toHaveBeenCalledWith({ timeRangeMs: 3600000 });
  });

  it('switches to the topology canvas with a valid selected-toggle class', async () => {
    const view = render(<ApmDashboard />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Topology Map' })).toBeTruthy());
    const toggle = view.getByRole('button', { name: 'Topology Map' });
    expect(toggle.className).not.toContain('[object Object]');
    fireEvent.click(toggle);
    expect(view.getByText('Topology canvas')).toBeTruthy();
    expect(toggle.className).toContain('bg-primary');
    expect(toggle.className).not.toContain('[object Object]');
    expect(mocks.fetchMap).toHaveBeenCalledWith({ timeRangeMs: 3600000 });
    fireEvent.click(view.getByRole('button', { name: 'Metrics Grid' }));
    expect(view.queryByText('Topology canvas')).toBeNull();
    expect(view.getByText('No Service Data Found')).toBeTruthy();
  });

  it('exposes a native export toggle and preserves its state across header updates', async () => {
    const view = render(<ApmDashboard />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Export' })).toBeTruthy());
    fireEvent.click(view.getByRole('button', { name: 'Export' }));
    const toggle = view.getByRole('button', { name: 'Export errors only' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(view.getByPlaceholderText('Search Service (e.g. auth-api)'), { target: { value: 'filter' } });
    expect(view.getByRole('button', { name: 'Export errors only' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('exports the selected service and filters as CSV and releases the download URL', async () => {
    let complete!: (value: { data: string; headers: Record<string, string> }) => void;
    mocks.exportSpans.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    mocks.metrics = [{ serviceName: 'payments', requestCount: 20, errorCount: 0, avgDurationMs: 10, p95DurationMs: 20, rpm: 2, errorRate: 0 }];
    const create = vi.fn(() => 'blob:fixture-csv');
    const revoke = vi.fn();
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: create, revokeObjectURL: revoke }));
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const view = render(<ApmDashboard />);
    fireEvent.click(await view.findByRole('button', { name: 'Export' }));
    fireEvent.change(view.getByPlaceholderText('11:03:55 PM'), { target: { value: '11:03:55 AM' } });
    fireEvent.change(view.getByPlaceholderText('11:08:30 PM'), { target: { value: '11:08:30 AM' } });
    fireEvent.click(view.getByRole('button', { name: 'All Services' }));
    fireEvent.click(view.getByRole('button', { name: 'payments' }));
    fireEvent.click(view.getByRole('button', { name: 'Any Duration' }));
    fireEvent.click(view.getByRole('button', { name: '> 500ms' }));
    fireEvent.change(view.getByPlaceholderText('e.g. mongodb.query, postgresql, http.request...'), { target: { value: ' db.query ' } });
    fireEvent.click(view.getByRole('button', { name: 'Export errors only' }));
    fireEvent.click(view.getByRole('button', { name: 'Download CSV' }));
    await waitFor(() => expect(mocks.exportSpans).toHaveBeenCalledWith(expect.objectContaining({ service: 'payments', minDuration: '500', search: 'db.query', errorOnly: 'true', from: expect.stringMatching(/Z$/), to: expect.stringMatching(/Z$/) })));
    expect(download).not.toHaveBeenCalled();
    expect((view.getByRole('button', { name: 'Exporting...' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { complete({ data: 'fixture,csv', headers: { 'content-disposition': 'attachment; filename="fixture.csv"' } }); });
    await waitFor(() => expect(view.queryByRole('heading', { name: 'Export Slow Queries' })).toBeNull());
    expect(download).toHaveBeenCalledTimes(1);
    expect((download.mock.instances[0] as HTMLAnchorElement).download).toBe('fixture.csv');
    expect(revoke).toHaveBeenCalledWith('blob:fixture-csv');
  });

  it('reports invalid export times before submitting a request', async () => {
    const view = render(<ApmDashboard />);
    fireEvent.click(await view.findByRole('button', { name: 'Export' }));
    fireEvent.change(view.getByPlaceholderText('11:03:55 PM'), { target: { value: 'invalid fixture time' } });
    fireEvent.click(view.getByRole('button', { name: 'Download CSV' }));
    expect(await view.findByText(/Invalid time format/)).toBeTruthy();
    expect(mocks.exportSpans).not.toHaveBeenCalled();
    expect((view.getByRole('button', { name: 'Download CSV' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps export errors visible and permits retry after a transport failure', async () => {
    mocks.exportSpans.mockRejectedValue(new Error('Fixture unavailable'));
    const view = render(<ApmDashboard />);
    fireEvent.click(await view.findByRole('button', { name: 'Export' }));
    fireEvent.click(view.getByRole('button', { name: 'Download CSV' }));
    expect(await view.findByText('Network error: Fixture unavailable')).toBeTruthy();
    expect((view.getByRole('button', { name: 'Download CSV' }) as HTMLButtonElement).disabled).toBe(false);
    expect(view.getByRole('heading', { name: 'Export Slow Queries' })).toBeTruthy();
  });

  it('refreshes topology with relative and absolute time presets', async () => {
    const view = render(<ApmDashboard />);
    fireEvent.click(await view.findByRole('button', { name: 'Topology Map' }));
    fireEvent.click(view.getByRole('button', { name: 'Last hour' }));
    fireEvent.click(view.getByRole('button', { name: 'Last 5 minutes' }));
    expect(mocks.refresh).toHaveBeenCalledWith({ timeRangeMs: 300000 });
    expect(mocks.fetchMap).toHaveBeenCalledWith({ timeRangeMs: 300000 });
    fireEvent.click(view.getByRole('button', { name: 'Last 5 minutes' }));
    fireEvent.click(view.getByRole('button', { name: /Yesterday/ }));
    expect(mocks.refresh).toHaveBeenCalledWith(expect.objectContaining({ fromMs: expect.any(Number), toMs: expect.any(Number), timeRangeMs: 86399999 }));
    expect(mocks.fetchMap).toHaveBeenLastCalledWith(expect.objectContaining({ fromMs: expect.any(Number), toMs: expect.any(Number) }));
  });

  it('trims trace IDs for direct lookup and clears the current trace', async () => {
    const view = render(<ApmDashboard />);
    const search = await view.findByPlaceholderText('Paste Trace ID (e.g. 1a2b3c...)');
    fireEvent.change(search, { target: { value: ' fixture-trace ' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(mocks.fetchTrace).toHaveBeenCalledWith('fixture-trace');
    fireEvent.click(view.getByRole('button', { name: 'Search Trace' }));
    expect(mocks.fetchTrace).toHaveBeenCalledTimes(2);
    fireEvent.click(search.parentElement!.querySelector('button')!);
    expect((search as HTMLInputElement).value).toBe('');
    expect(mocks.clearTrace).toHaveBeenCalledTimes(1);
  });
});
