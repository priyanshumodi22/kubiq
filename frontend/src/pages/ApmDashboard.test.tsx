// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ApmDashboard from './ApmDashboard';

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(), getTraces: vi.fn(), fetchTrace: vi.fn(), clearTrace: vi.fn(), refresh: vi.fn(), fetchMap: vi.fn(),
  metrics: [] as Array<{ serviceName: string; requestCount: number; errorCount: number; avgDurationMs: number; p95DurationMs: number; rpm: number; errorRate: number }>,
  loading: false, error: null as string | null, canExport: true,
}));
vi.mock('../services/api', () => ({ apiClient: { getApmStatus: mocks.getStatus, getApmServiceTraces: mocks.getTraces } }));
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
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('APM dashboard characterization', () => {
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
});
