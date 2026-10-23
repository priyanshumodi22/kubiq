// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogViewer } from './LogViewer';

const mocks = vi.hoisted(() => ({ sockets: [] as Array<{ handlers: Map<string, (data?: unknown) => void>; emit: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; removeAllListeners: ReturnType<typeof vi.fn> }> }));
vi.mock('socket.io-client', () => ({ default: () => {
    const handlers = new Map<string, (data?: unknown) => void>();
    const socket = { handlers, on: (name: string, handler: (data?: unknown) => void) => { handlers.set(name, handler); }, emit: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn(() => handlers.clear()) };
    mocks.sockets.push(socket);
    return socket;
} }));
vi.mock('react-virtuoso', () => ({ Virtuoso: ({ data, itemContent }: { data: Array<{ id: number }>; itemContent: (index: number, item: { id: number }) => React.ReactNode }) => <div>{data.map((item, index) => <div key={item.id}>{itemContent(index, item)}</div>)}</div> }));
vi.mock('../services/api', () => ({ apiClient: { getToken: () => 'test-token', getRecentSummary: vi.fn().mockResolvedValue({ available: false }) } }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => true }) }));
vi.mock('./LogSearch', () => ({ LogSearch: () => null }));
vi.mock('./ProUpgradeModal', () => ({ ProUpgradeModal: () => null }));
vi.mock('./AiStatusOrb', () => ({ AiStatusOrb: () => null }));
beforeEach(() => { mocks.sockets.length = 0; });
afterEach(cleanup);
const props = { logPath: '/var/log/app.log', isOpen: true, onClose: vi.fn(), serviceName: 'api', isEmbedded: true };
const send = (event: string, data?: unknown) => act(() => { mocks.sockets.at(-1)!.handlers.get(event)?.(data); });

describe('raw log subscription compatibility', () => {
    it('counts incoming lines while paused without reconnecting', async () => {
        const view = render(<LogViewer {...props} />);
        await act(async () => {});
        send('connect');
        fireEvent.click(view.getByRole('button', { name: 'Tailing' }));
        send('log:line', { content: 'INFO one\nERROR two\n' });
        expect(view.getByRole('button', { name: '2 New Lines' })).toBeTruthy();
        expect(mocks.sockets).toHaveLength(1);
        fireEvent.click(view.getByRole('button', { name: '2 New Lines' }));
        expect(view.queryByRole('button', { name: '2 New Lines' })).toBeNull();
    });

    it('preserves watch context and mixed-case trace links, and removes old listeners', async () => {
        const view = render(<LogViewer {...props} />);
        await act(async () => {});
        send('connect');
        expect(mocks.sockets[0].emit).toHaveBeenCalledWith('watch:log', { path: props.logPath, pattern: undefined, limit: undefined, serviceName: 'api' });
        send('log:init', { content: 'INFO traceId=AbCdEf1234567890 ready\n' });
        expect(view.getByRole('link').getAttribute('href')).toBe('/apm?traceId=AbCdEf1234567890');
        view.unmount();
        expect(mocks.sockets[0].disconnect).toHaveBeenCalledTimes(1);
        expect(mocks.sockets[0].handlers.size).toBe(0);
    });

    it('rebinds the same path when the service context changes', async () => {
        const view = render(<LogViewer {...props} />);
        await act(async () => {});
        send('connect');
        view.rerender(<LogViewer {...props} serviceName="worker" />);
        send('connect');
        expect(mocks.sockets.at(-1)!.emit).toHaveBeenLastCalledWith('watch:log', expect.objectContaining({ serviceName: 'worker', path: props.logPath }));
        expect(mocks.sockets[0].emit).toHaveBeenCalledWith('stop:watch');
        expect(mocks.sockets[0].handlers.size).toBe(0);
    });

    it('uses an updated source path and file limit without requiring a new source identity', async () => {
        const source = { id: 'app', name: 'Application', path: '/logs/*.log', fileLimit: 2 };
        const view = render(<LogViewer {...props} logSources={[source]} />);
        await act(async () => {});
        send('connect');
        view.rerender(<LogViewer {...props} logSources={[{ ...source, path: '/updated/*.log', fileLimit: 4 }]} />);
        send('connect');
        expect(mocks.sockets.at(-1)!.emit).toHaveBeenLastCalledWith('watch:log', { serviceName: 'api', path: '/updated/*.log', pattern: '/updated/*.log', limit: 4 });
    });

    it('preserves histogram bins and switches resolved files with a clean buffer', async () => {
        const source = { id: 'app', name: 'Application', path: '/logs/*.log', fileLimit: 2 };
        const view = render(<LogViewer {...props} logSources={[source]} />);
        await act(async () => {});
        send('log:init', { content: 'INFO ready\nERROR failure\n' });
        expect(view.container.querySelectorAll('[title^="Bucket "]')).toHaveLength(15);
        expect(view.getByTitle('Bucket 1: 1 logs (0 err, 0 warn)')).toBeTruthy();
        expect(view.getByTitle('Bucket 2: 1 logs (1 err, 0 warn)')).toBeTruthy();
        send('log:file_list', { files: [{ path: '/logs/new.log', name: 'new.log' }, { path: '/logs/old.log', name: 'old.log' }] });
        fireEvent.click(view.getByTitle('/logs/old.log'));
        expect(view.queryByText('ERROR failure')).toBeNull();
        send('connect');
        expect(mocks.sockets.at(-1)!.emit).toHaveBeenLastCalledWith('watch:log', { path: '/logs/old.log', pattern: '/logs/*.log', limit: 2, serviceName: 'api' });
    });
});
