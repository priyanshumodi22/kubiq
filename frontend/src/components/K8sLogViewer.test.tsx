// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { K8sLogViewer } from './K8sLogViewer';

const mocks = vi.hoisted(() => ({ sockets: [] as Array<{ handlers: Map<string, (data?: unknown) => void>; emit: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; removeAllListeners: ReturnType<typeof vi.fn> }> }));
vi.mock('socket.io-client', () => ({ default: () => {
    const handlers = new Map<string, (data?: unknown) => void>();
    const socket = { handlers, on: (name: string, handler: (data?: unknown) => void) => { handlers.set(name, handler); }, emit: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn(() => handlers.clear()) };
    mocks.sockets.push(socket);
    return socket;
} }));
vi.mock('react-virtuoso', () => ({ Virtuoso: ({ data, itemContent }: { data: Array<{ id: number }>; itemContent: (index: number, item: { id: number }) => React.ReactNode }) => <div>{data.map((item, index) => <div key={item.id}>{itemContent(index, item)}</div>)}</div> }));
vi.mock('../services/api', () => ({ apiClient: { getToken: () => 'test-token', getRecentSummary: vi.fn().mockResolvedValue({ available: false }) } }));
vi.mock('./LogSearch', () => ({ LogSearch: ({ initialQuery }: { initialQuery?: string }) => <div>Historical search{initialQuery ? `: ${initialQuery}` : ''}</div> }));
vi.mock('./ProUpgradeModal', () => ({ ProUpgradeModal: () => null }));
vi.mock('./AiStatusOrb', () => ({ AiStatusOrb: () => null }));
beforeEach(() => { mocks.sockets.length = 0; });
afterEach(cleanup);
const props = { namespace: 'apps', podName: 'api-123', containers: [{ name: 'api', image: 'api:v1' }, { name: 'proxy', image: 'proxy:v1' }] };
const send = (event: string, data?: unknown) => act(() => { mocks.sockets.at(-1)!.handlers.get(event)?.(data); });

describe('Kubernetes log viewer compatibility', () => {
    it('opens historical search with the trace correlation filter', async () => {
        const view = render(<K8sLogViewer {...props} initialSearchQuery="trace-fixture" />);
        expect(view.getByText('Historical search: trace-fixture')).toBeTruthy();
    });
    it('subscribes with the selected target and filters classified log rows', async () => {
        const view = render(<K8sLogViewer {...props} />);
        await act(async () => {});
        send('connect');
        expect(mocks.sockets[0].emit).toHaveBeenCalledWith('k8s:watch:logs', { namespace: 'apps', podName: 'api-123', deploymentName: undefined, container: 'api', tailLines: 100 });
        send('k8s:log:init', { lines: ['INFO ready', 'ERROR failure'] });
        expect(view.getByText('ERROR failure').parentElement?.className).toContain('text-red-400');
        fireEvent.change(view.getByPlaceholderText('Search or Regex logs...'), { target: { value: 'failure' } });
        expect(view.queryByText('INFO ready')).toBeNull();
        expect(view.getByText('ERROR failure')).toBeTruthy();
    });

    it('keeps pause/new-line and ended-state behavior', async () => {
        const view = render(<K8sLogViewer {...props} />);
        await act(async () => {});
        send('connect');
        fireEvent.click(view.getByTitle('Pause tailing'));
        send('k8s:log:line', { content: 'one\ntwo\n' });
        expect(view.getByRole('button', { name: '2 new lines' })).toBeTruthy();
        fireEvent.click(view.getByTitle('Resume tailing'));
        expect(view.queryByRole('button', { name: '2 new lines' })).toBeNull();
        fireEvent.click(view.getByTitle('Pause tailing'));
        send('k8s:log:line', { content: 'three\n' });
        expect(view.getByRole('button', { name: '1 new line' })).toBeTruthy();
        send('k8s:log:end');
        expect(view.getByText('ENDED')).toBeTruthy();
    });

    it('cleans up the old subscription when switching containers and on unmount', async () => {
        const view = render(<K8sLogViewer {...props} />);
        await act(async () => {});
        send('connect');
        fireEvent.click(view.getByRole('button', { name: 'api' }));
        fireEvent.click(view.getByRole('button', { name: 'proxy' }));
        expect(mocks.sockets[0].emit).toHaveBeenCalledWith('k8s:stop:logs');
        expect(mocks.sockets[0].disconnect).toHaveBeenCalledTimes(1);
        expect(mocks.sockets[0].handlers.size).toBe(0);
        expect(view.getByText('CONNECTING')).toBeTruthy();
        send('connect');
        expect(mocks.sockets[1].emit).toHaveBeenCalledWith('k8s:watch:logs', expect.objectContaining({ container: 'proxy' }));
        view.unmount();
        expect(mocks.sockets[1].disconnect).toHaveBeenCalledTimes(1);
        expect(mocks.sockets[1].handlers.size).toBe(0);
    });
    it('subscribes by saved source identity, reports waiting/errors, and stops on disconnect', async () => {
        const view = render(<K8sLogViewer namespace="apps" sourceId="saved" sourceName="Web logs" containers={[]} />);
        await act(async () => {}); send('connect');
        expect(mocks.sockets[0].emit).toHaveBeenCalledWith('k8s:watch:source', { sourceId: 'saved', tailLines: 100 });
        expect(mocks.sockets[0].emit).not.toHaveBeenCalledWith('k8s:watch:logs', expect.anything());
        send('k8s:log:status', { waiting: true, message: 'Waiting for matching pods' });
        expect(view.getByText(/Waiting for matching pods/)).toBeTruthy();
        send('k8s:log:status', { waiting: false, message: 'Following' }); expect(view.getByText('LIVE')).toBeTruthy();
        send('k8s:log:status', { waiting: false, ended: true, message: 'Completed container logs loaded.' }); expect(view.getByText('ENDED')).toBeTruthy();
        send('connect_error'); expect(view.getByText(/Log connection unavailable/)).toBeTruthy();
        send('k8s:log:error', { message: 'Access denied' }); expect(view.getByText(/Access denied/)).toBeTruthy();
        send('disconnect'); view.unmount(); expect(mocks.sockets[0].disconnect).toHaveBeenCalled();
    });

});
