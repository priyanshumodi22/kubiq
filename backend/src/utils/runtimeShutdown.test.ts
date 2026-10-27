import { afterEach, expect, jest, test } from '@jest/globals';
import type { ServerResponse } from 'node:http';
import { shutdownRuntime } from './runtimeShutdown';
afterEach(() => { jest.useRealTimers(); });
function fixture(responses = new Set<ServerResponse>()) {
    const order: string[] = [];
    const options = {
        responses,
        stopBackground: () => { order.push('background'); },
        stopStreams: () => { order.push('streams'); },
        closeStorage: async () => { order.push('close-storage'); },
        ingestion: { stop: () => { order.push('stop-ingestion'); }, drain: async () => { order.push('drain'); } },
        tracing: { shutdown: async () => { order.push('tracing'); } },
        server: { close: (callback: () => void) => { order.push('close'); callback(); } },
    };
    return { order, options };
}
test('final loopback spans drain before closing the HTTP listener', async () => {
    const { order, options } = fixture();
    expect(await shutdownRuntime(options)).toBe(true);
    expect(order).toEqual(['background', 'streams', 'stop-ingestion', 'drain', 'tracing', 'drain', 'close', 'close-storage']);
});
test('SSE streams close before waiting for remaining responses', async () => {
    const responses = new Set<ServerResponse>();
    const stream = { getHeader: () => 'text/event-stream', end: () => { responses.delete(stream); } } as unknown as ServerResponse;
    responses.add(stream);
    expect(await shutdownRuntime(fixture(responses).options)).toBe(true);
    expect(responses.size).toBe(0);
});
test('in-flight requests may finish during the drain window', async () => {
    jest.useFakeTimers();
    const responses = new Set<ServerResponse>();
    const response = { getHeader: () => 'application/json', destroy: jest.fn() } as unknown as ServerResponse;
    responses.add(response);
    const shutdown = shutdownRuntime(fixture(responses).options);
    setTimeout(() => responses.delete(response), 100);
    await jest.advanceTimersByTimeAsync(120);
    expect(await shutdown).toBe(true);
    expect(response.destroy).not.toHaveBeenCalled();
});
test('hung requests are destroyed after two seconds and a hung export cannot exceed five seconds total', async () => {
    jest.useFakeTimers();
    const response = { getHeader: () => 'application/json', destroy: jest.fn() } as unknown as ServerResponse;
    const { options, order } = fixture(new Set([response]));
    options.tracing.shutdown = () => new Promise(() => {});
    const shutdown = shutdownRuntime(options);
    await jest.advanceTimersByTimeAsync(2000);
    expect(response.destroy).toHaveBeenCalledTimes(1);
    expect(order).not.toContain('close');
    await jest.advanceTimersByTimeAsync(3000);
    expect(await shutdown).toBe(false);
});
