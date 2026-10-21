import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { startPollingStream } from './pollingStream';

const response = () => ({ write: jest.fn<(data: string) => boolean>(() => true), end: jest.fn<() => void>(), writableEnded: false, destroyed: false });
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('polling SSE lifecycle', () => {
  test('writes completed snapshots in order and removes timers on close', async () => {
    const request = new EventEmitter();
    const stream = response();
    const snapshot = jest.fn<() => Promise<string>>().mockResolvedValueOnce('first').mockResolvedValue('second');
    startPollingStream(request, stream, snapshot);
    await Promise.resolve();
    expect(stream.write).toHaveBeenCalledWith('first');
    await jest.advanceTimersByTimeAsync(5000);
    expect(stream.write).toHaveBeenLastCalledWith('second');
    request.emit('close');
    expect(stream.end).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    expect(request.listenerCount('close')).toBe(0);
  });
  test('does not overlap requests or write after cancellation', async () => {
    const request = new EventEmitter();
    const stream = response();
    let resolve: (value: string) => void = () => undefined;
    const snapshot = jest.fn(() => new Promise<string>(done => { resolve = done; }));
    startPollingStream(request, stream, snapshot);
    await jest.advanceTimersByTimeAsync(15000);
    expect(snapshot).toHaveBeenCalledTimes(1);
    request.emit('close');
    resolve('late');
    await Promise.resolve();
    expect(stream.write).not.toHaveBeenCalled();
  });
  test('handles snapshot failure without an unhandled rejection or retry leak', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const request = new EventEmitter();
    const stream = response();
    startPollingStream(request, stream, async () => { throw new Error('repository offline'); });
    await Promise.resolve();
    expect(stream.end).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    expect(stream.write).not.toHaveBeenCalled();
  });
  test('a reconnect has an independent lifecycle', async () => {
    const oldRequest = new EventEmitter();
    const oldStream = response();
    startPollingStream(oldRequest, oldStream, async () => 'old');
    oldRequest.emit('close');
    const newRequest = new EventEmitter();
    const newStream = response();
    const stop = startPollingStream(newRequest, newStream, async () => 'new');
    await Promise.resolve();
    expect(oldStream.write).not.toHaveBeenCalled();
    expect(newStream.write).toHaveBeenCalledWith('new');
    stop();
  });
});
