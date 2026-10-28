import { jest, expect, it, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { trace } from '@opentelemetry/api';
import { requestCompletionLog } from './requestCompletionLog';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { IngestionBufferService } from '../services/IngestionBufferService';
jest.mock('../database/DatabaseFactory', () => ({ DatabaseFactory: { isLogStorageSupported: jest.fn(() => true) } }));
jest.mock('../services/IngestionBufferService', () => ({ IngestionBufferService: { getInstance: jest.fn() } }));
const traceId = '1234567890abcdef1234567890abcdef', spanId = '1234567890abcdef';
const addLogs = jest.fn<(logs: { message: string }[]) => boolean>(() => true);
beforeEach(() => {
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue({ spanContext: () => ({ traceId, spanId }) } as ReturnType<typeof trace.getActiveSpan>);
    (IngestionBufferService.getInstance as jest.Mock<(...args: unknown[]) => unknown>).mockReturnValue({ addLogs });
    (DatabaseFactory.isLogStorageSupported as jest.Mock<(...args: unknown[]) => unknown>).mockReturnValue(true); addLogs.mockReset().mockReturnValue(true);
});
afterEach(() => { jest.restoreAllMocks(); });
function response(status = 200, completed = true) { return Object.assign(new EventEmitter(), { statusCode: status, writableFinished: completed }) as unknown as Response; }
it.each([200, 403, 503])('records one real completion with IDs and safe route for status %i', status => {
    const res = response(status);
    requestCompletionLog({ method: 'GET', url: '/users/SECRET?password=SECRET', headers: { authorization: 'SECRET' }, body: 'SECRET' } as unknown as Request, res, () => '/users/:id');
    res.emit('finish'); res.emit('close');
    expect(addLogs).toHaveBeenCalledTimes(1);
    const log = addLogs.mock.calls[0][0][0];
    expect(log).toMatchObject({ traceId, metadata: { traceId, spanId }, serviceName: 'kubiq-backend', sourceName: 'http-requests', level: status >= 500 ? 'ERROR' : 'INFO' });
    expect(JSON.parse(log.message)).toMatchObject({ trace_id: traceId, span_id: spanId, route: '/users/:id', method: 'GET', status_code: status, outcome: 'completed' });
    expect(JSON.stringify(log)).not.toContain('SECRET');
    expect(res.listenerCount('close')).toBe(0);
});
it('records aborted completion once and bounds failures without leaking payloads', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); addLogs.mockReturnValue(false);
    const res = response(200, false); requestCompletionLog({ method: 'bad SECRET' } as Request, res, () => '/safe'); res.emit('close'); res.emit('finish');
    expect(JSON.parse(addLogs.mock.calls[0][0][0].message)).toMatchObject({ outcome: 'aborted', method: 'OTHER' });
    expect(warn).toHaveBeenCalledWith('[logs] request_completion_dropped', { count: 1 });
});
it('does not log excluded or disabled tracing scopes', () => {
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined);
    const res = response(); requestCompletionLog({} as Request, res, () => '/health'); res.emit('finish'); expect(addLogs).not.toHaveBeenCalled();
});
it('does not break completion if the buffer throws; falls back only for unsupported adapters', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); addLogs.mockImplementationOnce(() => { throw new Error('SECRET'); });
    const res = response(); requestCompletionLog({ method: 'GET' } as Request, res, () => '/safe'); expect(() => res.emit('finish')).not.toThrow(); expect(warn).toHaveBeenCalled();
    (DatabaseFactory.isLogStorageSupported as jest.Mock<(...args: unknown[]) => unknown>).mockReturnValue(false); const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const other = response(); requestCompletionLog({ method: 'GET' } as Request, other, () => '/safe'); other.emit('finish'); expect(info).toHaveBeenCalledWith(expect.stringContaining(traceId));
});
