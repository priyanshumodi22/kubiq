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
});
