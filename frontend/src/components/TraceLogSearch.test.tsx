import { MemoryRouter } from 'react-router-dom';
// @vitest-environment jsdom
import { cleanup, fireEvent, render as rtlRender, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TraceLogSearch } from './TraceLogSearch';
const mock = vi.hoisted(() => ({ get: vi.fn(), toast: vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
const render = (ui: React.ReactElement) => rtlRender(<MemoryRouter basename="/kubiq" initialEntries={['/kubiq/logs']}>{ui}</MemoryRouter>);
vi.mock('../services/api', () => ({ apiClient: { getTraceLogs: mock.get } }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ addToast: mock.toast }) }));
vi.mock('react-virtuoso', () => ({ Virtuoso: ({ data, itemContent }: { data: object[]; itemContent: (index: number, log: object) => React.ReactNode }) => <div>{data.map((log, index) => <div key={index}>{itemContent(index, log)}</div>)}</div> }));
const result = { fromMs: 1000, toMs: 5000, traceFound: true, sourceCount: 2, logs: [] };
beforeEach(() => { mock.get.mockReset(); mock.toast.mockReset(); });
afterEach(cleanup);
it('automatically searches all permitted sources and explains an empty historical result', async () => {
    mock.get.mockResolvedValue(result);
    const view = render(<TraceLogSearch traceId="abc" onAllSources={vi.fn()} />);
    expect(view.getByRole('status')).toBeTruthy();
    expect(await view.findByText('No correlated logs retained')).toBeTruthy();
    expect(mock.get).toHaveBeenCalledWith('abc', undefined, expect.any(AbortSignal), undefined);
    expect(view.getByText(/retroactively/)).toBeTruthy();
});
it('renders real records, source scope and a reset action', async () => {
    mock.get.mockResolvedValue({ ...result, logs: [{ timestamp: new Date(0).toISOString(), level: 'INFO', serviceName: 'api', sourceName: 'requests', message: 'actual completion abc' }] });
    const all = vi.fn(); const view = render(<TraceLogSearch traceId="abc" serviceName="api" onAllSources={all} />);
    expect(await view.findByText('actual completion abc')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Search all permitted sources' })); expect(all).toHaveBeenCalledTimes(1);
});
it('distinguishes unavailable storage from an empty result, uses kubiq toast and supports retry', async () => {
    mock.get.mockRejectedValueOnce({ isAxiosError: true, response: { data: { message: 'Access denied.' } } }).mockResolvedValue(result);
    const view = render(<TraceLogSearch traceId="abc" onAllSources={vi.fn()} />);
    expect((await view.findByRole('alert')).textContent).toBe('Access denied.');
    expect(mock.toast).toHaveBeenCalledWith('Access denied.', 'error');
    expect(view.queryByText('No correlated logs retained')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Search again' }));
    expect(await view.findByText('No correlated logs retained')).toBeTruthy();
});
it('cancels stale requests and ignores their late result', async () => {
    let finish: (value: object) => void = () => {};
    mock.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue({ ...result, logs: [{ timestamp: new Date(0).toISOString(), level: 'INFO', serviceName: 'api', sourceName: 'requests', message: 'new result' }] });
    const view = render(<TraceLogSearch traceId="old" onAllSources={vi.fn()} />);
    const signal = mock.get.mock.calls[0][2];
    view.rerender(<TraceLogSearch traceId="new" onAllSources={vi.fn()} />);
    expect(signal.aborted).toBe(true);
    finish(result);
    await waitFor(() => expect(view.getByText('new result')).toBeTruthy());
    expect(view.queryByText('No correlated logs retained')).toBeNull();
});

it('searches the exact selected span and lets the user expand to the entire trace', async () => {
    mock.get.mockResolvedValue(result); const reset = vi.fn();
    const view = render(<TraceLogSearch traceId="abc" spanId="1234567890abcdef" onAllSources={vi.fn()} onWholeTrace={reset} />);
    await view.findByText('No correlated logs retained');
    expect(mock.get).toHaveBeenCalledWith('abc', undefined, expect.any(AbortSignal), '1234567890abcdef');
    fireEvent.click(view.getByRole('button', { name: 'Search entire trace' })); expect(reset).toHaveBeenCalledTimes(1);
});
