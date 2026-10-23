import { EventEmitter } from 'node:events';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import * as chokidar from 'chokidar';
import { Socket, Server } from 'socket.io';
import { LogStreamService } from './LogStreamService';

jest.mock('node:fs', () => ({ __esModule: true, default: { statSync: jest.fn(), stat: jest.fn(), createReadStream: jest.fn() } }));
jest.mock('chokidar', () => ({ watch: jest.fn() }));
jest.mock('glob', () => ({ glob: jest.fn() }));
jest.mock('../middleware/auth', () => ({ getSocketUser: jest.fn() }));
jest.mock('./RbacRoleService', () => ({ RbacRoleService: {} }));
jest.mock('./IngestionBufferService', () => ({ IngestionBufferService: { getInstance: () => ({ ingestLines: jest.fn() }) } }));

type Internals = {
    subscribeToFileWatcher(socket: Socket, path: string, service: string): void;
    unsubscribeSocket(socket: Socket): void;
};
type StatMock = jest.Mock<(path: string, callback: (error: null, stats: { size: number }) => void) => void>;
let watcher: EventEmitter & { close: jest.Mock };
let stream: EventEmitter & { destroy: jest.Mock };
let service: Internals;
let emit: jest.Mock;
const socket = (id: string) => ({ id, join: jest.fn(), leave: jest.fn() } as unknown as Socket);
beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (LogStreamService as unknown as { instance?: LogStreamService }).instance = undefined;
    watcher = Object.assign(new EventEmitter(), { close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined) });
    stream = Object.assign(new EventEmitter(), { destroy: jest.fn() });
    (chokidar.watch as jest.Mock).mockReturnValue(watcher);
    (fs.statSync as jest.Mock).mockReturnValue({ size: 10 });
    (fs.stat as unknown as StatMock).mockImplementation((_path, callback) => callback(null, { size: 20 }));
    (fs.createReadStream as jest.Mock).mockReturnValue(stream);
    emit = jest.fn();
    const instance = LogStreamService.getInstance();
    instance.initialize({ on: jest.fn(), to: jest.fn().mockReturnValue({ emit }) } as unknown as Server);
    service = instance as unknown as Internals;
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

describe('shared raw log streaming lifecycle', () => {
    it('shares one watcher and closes it only after the last subscriber leaves', () => {
        const first = socket('first'), second = socket('second');
        service.subscribeToFileWatcher(first, '/logs/api.log', 'api');
        service.subscribeToFileWatcher(second, '/logs/api.log', 'api');
        expect(chokidar.watch).toHaveBeenCalledTimes(1);
        service.unsubscribeSocket(first);
        expect(watcher.close).not.toHaveBeenCalled();
        service.unsubscribeSocket(second);
        expect(watcher.close).toHaveBeenCalledTimes(1);
        expect(second.leave).toHaveBeenCalledWith('file::/logs/api.log');
    });

    it('batches append chunks and cancels pending flush on cleanup', () => {
        const client = socket('first');
        service.subscribeToFileWatcher(client, '/logs/api.log', 'api');
        watcher.emit('change', '/logs/api.log');
        expect(fs.createReadStream).toHaveBeenCalledWith('/logs/api.log', { start: 10, end: 19 });
        stream.emit('data', Buffer.from('first\n'));
        stream.emit('data', Buffer.from('second\n'));
        jest.advanceTimersByTime(100);
        expect(emit).toHaveBeenCalledWith('log:line', { content: 'first\nsecond\n' });
        stream.emit('data', Buffer.from('pending'));
        service.unsubscribeSocket(client);
        jest.advanceTimersByTime(100);
        expect(emit).toHaveBeenCalledTimes(1);
    });

    it('flushes oversized buffers immediately and signals truncation', () => {
        service.subscribeToFileWatcher(socket('first'), '/logs/api.log', 'api');
        watcher.emit('change', '/logs/api.log');
        const large = 'x'.repeat(65537);
        stream.emit('data', Buffer.from(large));
        expect(emit).toHaveBeenCalledWith('log:line', { content: large });
        (fs.stat as unknown as StatMock).mockImplementation((_path, callback) => callback(null, { size: 0 }));
        watcher.emit('change', '/logs/api.log');
        expect(emit).toHaveBeenCalledWith('log:truncated', { message: 'File truncated' });
    });

    it('does not open a read stream from a stat completed after unsubscribe', () => {
        let finish!: (error: null, stats: { size: number }) => void;
        (fs.stat as unknown as StatMock).mockImplementation((_path, callback) => { finish = callback; });
        const client = socket('first');
        service.subscribeToFileWatcher(client, '/logs/api.log', 'api');
        watcher.emit('change', '/logs/api.log');
        service.unsubscribeSocket(client);
        finish(null, { size: 20 });
        expect(fs.createReadStream).not.toHaveBeenCalled();
    });

    it('destroys active reads and ignores their late data after unsubscribe', () => {
        const client = socket('first');
        service.subscribeToFileWatcher(client, '/logs/api.log', 'api');
        watcher.emit('change', '/logs/api.log');
        service.unsubscribeSocket(client);
        expect(stream.destroy).toHaveBeenCalledTimes(1);
        stream.emit('data', Buffer.from('late data'));
        jest.advanceTimersByTime(100);
        expect(emit).not.toHaveBeenCalled();
    });
});
