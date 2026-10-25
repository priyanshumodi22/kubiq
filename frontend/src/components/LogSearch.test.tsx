// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogSearch } from './LogSearch';

const mocks = vi.hoisted(() => ({ query: vi.fn(), sources: vi.fn(), recent: vi.fn() }));
vi.mock('../services/api', () => ({ apiClient: { queryLogs: mocks.query, getLogSources: mocks.sources, getRecentSummary: mocks.recent } }));
vi.mock('./ProUpgradeModal', () => ({ ProUpgradeModal: () => null }));
vi.mock('./AiStatusOrb', () => ({ AiStatusOrb: () => null }));
vi.mock('react-virtuoso', () => ({ Virtuoso: ({ data, itemContent }: { data: { _id: string; message: string }[]; itemContent: (index: number, log: object) => React.ReactNode }) => <div>{data.map((log, index) => <div key={log._id}>{itemContent(index, { timestamp: '2026-10-23T00:00:00Z', level: 'INFO', sourceName: '/app/api.log', ...log })}</div>)}</div> }));
beforeEach(() => { vi.clearAllMocks(); mocks.query.mockResolvedValue([]); mocks.sources.mockResolvedValue(['/app/api.log']); mocks.recent.mockResolvedValue({ available: false }); });
afterEach(cleanup);

describe('log search filter controls', () => {
  it('submits a correlated trace filter on the initial historical query', async () => {
    const trace = '29a74ad1415a68c437baccbe5289e648';
    const view = render(<LogSearch serviceName="api" initialQuery={trace} />);
    expect((view.getByLabelText('Search Text') as HTMLInputElement).value).toBe(trace);
    await waitFor(() => expect(mocks.query).toHaveBeenCalled());
    expect(mocks.query.mock.calls[0][0].get('search')).toBe(trace);
    expect(mocks.query.mock.calls[0][0].get('serviceName')).toBe('api');
  });
  it('renders historical row timestamp, severity, source and message', async () => {
    mocks.query.mockResolvedValue([{ _id: 'record', message: 'Connection failed', timestamp: '2026-10-23T00:00:00Z', level: 'ERROR', sourceName: '/app/error.log' }]);
    const view = render(<LogSearch serviceName="api" />);
    await waitFor(() => expect(view.getByText('Connection failed')).toBeTruthy());
    expect(view.getByText('ERROR').className).toContain('text-red-400');
    expect(view.getByTitle('/app/error.log').textContent).toBe('error.log');
    expect(view.getByText(new Date('2026-10-23T00:00:00Z').toLocaleString())).toBeTruthy();
  });

  it('ignores a prior service source lookup after changing services', async () => {
    let oldSources: ((value: string[]) => void) | undefined;
    mocks.sources.mockImplementationOnce(() => new Promise(resolve => { oldSources = resolve; }));
    mocks.sources.mockResolvedValue(['/new/current.log']);
    const view = render(<LogSearch serviceName="old" />);
    view.rerender(<LogSearch serviceName="new" />);
    const source = view.getByLabelText('Source');
    await waitFor(() => expect((source as HTMLButtonElement).disabled).toBe(false));
    await act(async () => { oldSources?.(['/old/stale.log']); });
    fireEvent.click(source);
    expect(view.getByRole('button', { name: 'current.log' })).toBeTruthy();
    expect(view.queryByRole('button', { name: 'stale.log' })).toBeNull();
  });
  it('does not overwrite newer manual search results with an older response', async () => {
    let oldSearch: ((value: { _id: string; message: string }[]) => void) | undefined;
    mocks.query.mockImplementationOnce(() => new Promise(resolve => { oldSearch = resolve; }));
    mocks.query.mockResolvedValue([{ _id: 'new', message: 'Current search result' }]);
    const view = render(<LogSearch serviceName="api" />);
    fireEvent.change(view.getByLabelText('Search Text'), { target: { value: 'current' } });
    fireEvent.keyDown(view.getByLabelText('Search Text'), { key: 'Enter' });
    await waitFor(() => expect(view.getByText('Current search result')).toBeTruthy());
    await act(async () => { oldSearch?.([{ _id: 'old', message: 'Stale search result' }]); });
    expect(view.queryByText('Stale search result')).toBeNull();
  });
  it('associates every filter label and supports keyboard selection with focus return', async () => {
    const view = render(<LogSearch serviceName="api" />);
    expect(view.getByLabelText('Search Text')).toBeTruthy();
    expect(view.getByLabelText('Time Range')).toBeTruthy();
    expect(view.getByLabelText('Source')).toBeTruthy();
    const level = view.getByLabelText('Level');
    await waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(level, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('All Levels');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('Error');
    fireEvent.click(document.activeElement!);
    expect(document.activeElement).toBe(level);
    expect(level.textContent).toBe('Error');
    expect(mocks.query).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(2));
    expect(mocks.query.mock.calls[1][0].get('level')).toBe('ERROR');
  });
  it('closes filter choices with Escape without changing the selection', async () => {
    const view = render(<LogSearch serviceName="api" />);
    await waitFor(() => expect(mocks.query).toHaveBeenCalled());
    const time = view.getByLabelText('Time Range');
    fireEvent.click(time);
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement?.textContent).toBe('Last 7 Days');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(document.activeElement).toBe(time);
    expect(time.textContent).toBe('Last 24 Hours');
    expect(time.getAttribute('aria-expanded')).toBe('false');
  });
});
