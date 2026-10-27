import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { IngestionBufferService } from './IngestionBufferService';
import { DatabaseFactory } from '../database/DatabaseFactory';

describe('IngestionBufferService bounds', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    const instance = (IngestionBufferService as any).instance;
    if (instance?.flushInterval) clearInterval(instance.flushInterval);
    (IngestionBufferService as any).instance = undefined;
    delete process.env.KUBIQ_INGESTION_MAX_BUFFERED_LOGS;
    delete process.env.KUBIQ_INGESTION_MAX_BUFFERED_SPANS;
    jest.useRealTimers();
  });

  it('rejects logs once the configured queue capacity is reached', () => {
    process.env.KUBIQ_INGESTION_MAX_BUFFERED_LOGS = '2';
    const buffer = IngestionBufferService.getInstance();
    expect(buffer.addLogs([{ message: 'one' }, { message: 'two' }])).toBe(true);
    expect(buffer.addLogs([{ message: 'three' }])).toBe(false);
  });

  it('keeps internal stream ingestion within the same log capacity', () => {
    process.env.KUBIQ_INGESTION_MAX_BUFFERED_LOGS = '2';
    const buffer = IngestionBufferService.getInstance() as any;
    buffer.ingestLines('api', 'pod-1', ['one', 'two', 'three']);
    expect(buffer.logBuffer).toHaveLength(2);
    expect(buffer.addLogs([{ message: 'four' }])).toBe(false);
  });

  it.each([
    ['[ERROR] request failed', 'ERROR'],
    ['level=warn request retried', 'WARN'],
    ['severity: INFO request completed', 'INFO'],
    ['{"level":"error","message":"failed"}', 'ERROR'],
    ['{"severity":"debug","message":"details"}', 'DEBUG'],
    ['ordinary application output', 'INFO'],
  ])('extracts %s as %s during line ingestion', (line, expected) => {
    const buffer = IngestionBufferService.getInstance() as any;
    buffer.ingestLines('api', 'pod-1', [line]);
    expect(buffer.logBuffer.at(-1)?.level).toBe(expected);
  });

  it('counts an in-flight database flush against log capacity', async () => {
    process.env.KUBIQ_INGESTION_MAX_BUFFERED_LOGS = '2';
    let releaseWrite!: () => void;
    const writePending = new Promise<void>((resolve) => { releaseWrite = resolve; });
    jest.spyOn(DatabaseFactory, 'getLogRepository').mockResolvedValue({ insertLogs: jest.fn(() => writePending) } as any);

    const buffer = IngestionBufferService.getInstance() as any;
    buffer.addLogs([{ message: 'one' }, { message: 'two' }]);
    const flushing = buffer.flushData();
    await Promise.resolve();

    expect(buffer.addLogs([{ message: 'three' }])).toBe(false);
    releaseWrite();
    await flushing;
  });

  it('drain awaits an in-flight write and the batch accepted during that write; stop cancels periodic writes', async () => {
    jest.useFakeTimers();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const insertLogs = jest.fn<() => Promise<void>>().mockReturnValueOnce(pending).mockResolvedValue(undefined);
    jest.spyOn(DatabaseFactory, 'getLogRepository').mockResolvedValue({ insertLogs } as any);
    const buffer = IngestionBufferService.getInstance();
    buffer.addLogs([{ message: 'one' }]);
    const draining = buffer.drain();
    await Promise.resolve();
    buffer.addLogs([{ message: 'two' }]);
    release();
    await draining;
    expect(insertLogs).toHaveBeenCalledTimes(2);
    buffer.stop();
    buffer.addLogs([{ message: 'three' }]);
    await jest.advanceTimersByTimeAsync(4000);
    expect(insertLogs).toHaveBeenCalledTimes(2);
    await buffer.drain();
    expect(insertLogs).toHaveBeenCalledTimes(3);
  });

  it('failed ingestion diagnostics contain counts, not errors or payloads', async () => {
    const error = new Error('SYNTHETIC_SECRET');
    const insertLogs = jest.fn<() => Promise<void>>().mockRejectedValue(error);
    jest.spyOn(DatabaseFactory, 'getLogRepository').mockResolvedValue({ insertLogs } as any);
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const buffer = IngestionBufferService.getInstance();
    buffer.addLogs([{ message: 'SYNTHETIC_SECRET' }]);
    await buffer.drain();
    expect(log).toHaveBeenCalledWith('[ingestion] log_batch_write_failed', { count: 1 });
    expect(JSON.stringify(log.mock.calls)).not.toContain('SYNTHETIC_SECRET');
  });
});
