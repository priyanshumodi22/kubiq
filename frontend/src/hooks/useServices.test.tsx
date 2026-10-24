// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServiceStatus, Stats } from '../types';

const mocks = vi.hoisted(() => ({ full: vi.fn(), status: vi.fn(), history: vi.fn(), token: vi.fn(), raw: true }));
vi.mock('../services/api', () => ({ apiClient: { getServices: mocks.full, getServicesStatus: mocks.status, getServiceHistory: mocks.history, getToken: mocks.token } }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => mocks.raw }) }));

class Stream {
  static instances: Stream[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string) { Stream.instances.push(this); }
}
const stats: Stats = { totalServices: 1, healthyServices: 1, unhealthyServices: 0, unknownServices: 0, averageUptime: 100, averageResponseTime: 5 };
const service: ServiceStatus = { id: 'persisted-id', name: 'api', endpoint: 'https://example.test', currentStatus: 'healthy', history: [], logPath: '/private/app.log' };
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubEnv('VITE_USE_SSE', 'true');
  vi.stubEnv('VITE_POLL_INTERVAL', '5000');
  vi.stubEnv('VITE_BACKEND_DNS', 'https://backend.test');
  vi.stubEnv('VITE_BACKEND_CONTEXT_PATH', '/prefix');
  vi.stubGlobal('EventSource', Stream);
  Stream.instances = [];
  mocks.raw = true;
  mocks.token.mockReturnValue('native token');
  mocks.full.mockResolvedValue({ services: [service], stats });
  mocks.status.mockResolvedValue({ services: [{ ...service, lastCheck: null }], stats });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('service stream authentication and lifecycle', () => {
  it('recovers polling errors and refreshes full data without overlapping requests', async () => {
    vi.stubEnv('VITE_USE_SSE', 'false');
    mocks.full.mockRejectedValueOnce(new Error('Full data unavailable'));
    mocks.status.mockRejectedValueOnce(new Error('Status unavailable'));
    const { useServices } = await import('./useServices');
    const { result, unmount } = renderHook(useServices);
    await act(async () => {});
    expect(result.current.error).toBe('Full data unavailable');
    expect(result.current.loading).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.error).toBe('Status unavailable');
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current.error).toBeNull();
    let complete: ((value: { services: ServiceStatus[]; stats: Stats }) => void) | undefined;
    mocks.full.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    act(() => { result.current.refresh(); result.current.refresh(); });
    expect(mocks.full).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);
    await act(async () => { complete?.({ services: [service], stats }); });
    expect(result.current.loading).toBe(false);
    expect(result.current.services[0].name).toBe('api');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects structurally invalid stream entries and keeps the last good snapshot', async () => {
    mocks.token.mockReturnValue(null);
    const { useServices } = await import('./useServices');
    const { result } = renderHook(useServices);
    await act(async () => {});
    const stream = Stream.instances[0];
    expect(stream.url).toBe('https://backend.test/prefix/api/services/stream');
    for (const snapshot of [null, {}, { services: [], stats: null }, { services: [null], stats }, { services: [{ name: 'broken', endpoint: 42 }], stats }]) {
      act(() => { stream.onmessage?.({ data: JSON.stringify(snapshot) }); });
    }
    expect(result.current.services[0].name).toBe('api');
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mocks.status).toHaveBeenCalledTimes(1);
  });

  it('handles history failures, explicit retries, missing history and cleared selection', async () => {
    mocks.history.mockRejectedValueOnce('unstructured failure');
    const { useServiceHistory } = await import('./useServices');
    const { result, rerender } = renderHook(({ name }: { name: string | null }) => useServiceHistory(name, 12), { initialProps: { name: 'api' as string | null } });
    await act(async () => {});
    expect(result.current.error).toBe('Failed to fetch history');
    expect(result.current.loading).toBe(false);
    mocks.history.mockResolvedValueOnce({});
    await act(async () => { await result.current.refresh(); });
    expect(mocks.history).toHaveBeenLastCalledWith('api', 12);
    expect(result.current.error).toBeNull();
    expect(result.current.history).toEqual([]);
    rerender({ name: null });
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(mocks.history).toHaveBeenCalledTimes(2);
  });

  it('authenticates Native sessions with the REST credential and configured base path', async () => {
    const { useServices } = await import('./useServices');
    const { result, unmount } = renderHook(useServices);
    await act(async () => {});
    expect(Stream.instances[0].url).toBe('https://backend.test/prefix/api/services/stream?token=native%20token');
    expect(result.current.services[0].id).toBe('persisted-id');
    unmount();
    expect(Stream.instances[0].close).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back once for malformed data and repeated stream errors', async () => {
    const { useServices } = await import('./useServices');
    const { unmount } = renderHook(useServices);
    await act(async () => {});
    const stream = Stream.instances[0];
    act(() => { stream.onmessage?.({ data: '{invalid' }); stream.onerror?.(); stream.onerror?.(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(mocks.status).toHaveBeenCalledTimes(1);
    unmount();
    act(() => { stream.onerror?.(); });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes cached private paths on permission revocation and rejects stale snapshots', async () => {
    let resolveOld: ((value: { services: ServiceStatus[]; stats: Stats }) => void) | undefined;
    mocks.full.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    const { useServices } = await import('./useServices');
    const { result, rerender } = renderHook(useServices);
    await act(async () => {});
    const oldStream = Stream.instances[0];
    mocks.raw = false;
    rerender();
    await act(async () => {});
    await act(async () => { resolveOld?.({ services: [{ ...service, name: 'stale' }], stats }); });
    act(() => { oldStream.onmessage?.({ data: JSON.stringify({ services: [{ ...service, name: 'stale' }], stats }) }); });
    expect(result.current.services[0].name).toBe('api');
    expect(result.current.services[0].logPath).toBeUndefined();
    expect(oldStream.close).toHaveBeenCalled();
  });

  it('preserves history and persisted identity during lightweight updates', async () => {
    const { useServices } = await import('./useServices');
    const { result } = renderHook(useServices);
    await act(async () => {});
    act(() => { Stream.instances[0].onmessage?.({ data: JSON.stringify({ services: [{ name: service.name, endpoint: service.endpoint, currentStatus: 'unhealthy', lastCheck: null }], stats }) }); });
    expect(result.current.services[0]).toMatchObject({ id: 'persisted-id', history: [], currentStatus: 'unhealthy' });
  });

  it('does not overlap fallback polls while a request is pending', async () => {
    mocks.status.mockImplementation(() => new Promise(() => {}));
    const { useServices } = await import('./useServices');
    renderHook(useServices);
    await act(async () => {});
    act(() => { Stream.instances[0].onerror?.(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(mocks.status).toHaveBeenCalledTimes(1);
  });

  it('discards an older service history response after the selection changes', async () => {
    let resolveOld: ((value: { history: { timestamp: number }[] }) => void) | undefined;
    mocks.history.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    mocks.history.mockResolvedValue({ history: [{ timestamp: 2 }] });
    const { useServiceHistory } = await import('./useServices');
    const { result, rerender } = renderHook(({ name }) => useServiceHistory(name), { initialProps: { name: 'old' } });
    rerender({ name: 'new' });
    await act(async () => {});
    await act(async () => { resolveOld?.({ history: [{ timestamp: 1 }] }); });
    expect(result.current.history).toEqual([{ timestamp: 2 }]);
  });
});
