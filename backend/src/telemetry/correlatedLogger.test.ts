import { EventEmitter } from 'node:events';
import { jest, expect, it, afterEach } from '@jest/globals';
import type { Response } from 'express';
import { trace } from '@opentelemetry/api';
import { emitCorrelatedEvent, logApplicationEvent, withRequestLogScope } from './correlatedLogger';
import { IngestionBufferService } from '../services/IngestionBufferService';
import { DatabaseFactory } from '../database/DatabaseFactory';
jest.mock('../services/IngestionBufferService', () => ({ IngestionBufferService: { getInstance: jest.fn() } }));
jest.mock('../database/DatabaseFactory', () => ({ DatabaseFactory: { isLogStorageSupported: jest.fn(() => true) } }));
const ids = { traceId: '1234567890abcdef1234567890abcdef', spanId: '1234567890abcdef' };
afterEach(() => { jest.restoreAllMocks(); });
it('writes the identical private event to stdout and bounded retention with IDs', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    const addLogs = jest.fn<(rows: { message: string; spanId: string }[]) => boolean>(() => true);
    jest.mocked(IngestionBufferService.getInstance).mockReturnValue({ addLogs } as unknown as IngestionBufferService);
    emitCorrelatedEvent({ event: 'fixture_completed' }, ids, 'application');
    const event = JSON.parse(String(info.mock.calls[0][0]));
    expect(event).toMatchObject({ trace_id: ids.traceId, span_id: ids.spanId, service: 'kubiq-backend' });
    expect(event.event_id).toMatch(/^[a-f0-9-]{36}$/);
    expect(addLogs.mock.calls[0][0][0]).toMatchObject({ message: info.mock.calls[0][0], spanId: ids.spanId });
});
it('inherits active child-span context and stops enriching delayed work after response completion', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue({ spanContext: () => ids } as ReturnType<typeof trace.getActiveSpan>);
    jest.mocked(IngestionBufferService.getInstance).mockReturnValue({ addLogs: () => true } as unknown as IngestionBufferService);
    const res = new EventEmitter() as Response;
    let delayed: Promise<void> = Promise.resolve();
    withRequestLogScope(res, () => {
        logApplicationEvent('request_error', { error_type: 'Error', action: 'password=SYNTHETIC_SECRET' }, 'ERROR');
        delayed = new Promise(resolve => setImmediate(() => { logApplicationEvent('late_event'); resolve(); }));
    });
    res.emit('finish'); await delayed;
    expect(info).toHaveBeenCalledTimes(2); expect(String(info.mock.calls[0][0])).not.toContain('SYNTHETIC_SECRET');
    expect(JSON.parse(String(info.mock.calls[1][0]))).not.toHaveProperty('trace_id');
    expect(res.listenerCount('close')).toBe(0);
});
it('does not create orphan IDs outside eligible scopes or fail requests on overflow', () => {
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue(undefined);
    const res = new EventEmitter() as Response; let called = false; withRequestLogScope(res, () => { called = true; logApplicationEvent('outside_event'); }); expect(called).toBe(true); expect(res.listenerCount('finish')).toBe(0);
    const info = jest.spyOn(console, 'info').mockImplementation(() => {}), warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.mocked(IngestionBufferService.getInstance).mockReturnValue({ addLogs: () => false } as unknown as IngestionBufferService);
    emitCorrelatedEvent({ event: 'fixture' }, ids, 'application'); expect(info).toHaveBeenCalledTimes(1); expect(warn).toHaveBeenCalledWith('[logs] correlated_event_dropped', { count: 1 });
    jest.mocked(DatabaseFactory.isLogStorageSupported).mockReturnValue(false); emitCorrelatedEvent({ event: 'fixture' }, ids, 'application'); expect(info).toHaveBeenCalledTimes(2);
});
