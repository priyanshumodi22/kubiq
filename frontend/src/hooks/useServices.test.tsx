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
