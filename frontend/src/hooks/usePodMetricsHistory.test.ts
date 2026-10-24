// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePodMetricsHistory } from './usePodMetricsHistory';

const mocks = vi.hoisted(() => ({ status: vi.fn(), history: vi.fn() }));
vi.mock('../services/api', () => ({ apiClient: { getKubernetesStatus: mocks.status, getKubernetesPodMetricsHistory: mocks.history } }));
const samples = [{ cpu_m: 25, memory_mi: 64, timestamp_ms: 1000 }];
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers();
  mocks.status.mockResolvedValue({ clickhouseEnabled: true, scrapeInterval: 2 });
  mocks.history.mockResolvedValue(samples);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const settle = async () => { await act(async () => { await Promise.resolve(); }); };

describe('pod metrics history lifecycle', () => {
  it('maps samples, refreshes at the configured interval, reports failure and cleans up timers', async () => {
    const { result, unmount } = renderHook(() => usePodMetricsHistory('fixture', 'pod-a', true));
    await settle();
    expect(mocks.history).toHaveBeenCalledWith('fixture', 'pod-a');
    expect(result.current.clickhouseMetrics).toEqual({ cpu: [25], memory: [64], timestamps: [1000] });
    expect(result.current.scrapeIntervalSec).toBe(2);
    expect(result.current.isCheckingConfig).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.refreshCountdown).toBe(1);
    mocks.history.mockRejectedValue(new Error('Fixture history unavailable'));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(mocks.history).toHaveBeenCalledTimes(2);
    expect(result.current.clickhouseMetrics).toBeNull();
    expect(result.current.isFetchingHistory).toBe(false);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(mocks.history).toHaveBeenCalledTimes(2);
  });

  it('does not poll when history collection or the caller is disabled', async () => {
    mocks.status.mockResolvedValue({ clickhouseEnabled: false });
    const first = renderHook(() => usePodMetricsHistory('fixture', 'pod-a', true));
    await settle();
    expect(first.result.current.isCheckingConfig).toBe(false);
    expect(first.result.current.scrapeIntervalSec).toBe(60);
    first.unmount();
    const calls = mocks.status.mock.calls.length;
    renderHook(() => usePodMetricsHistory('fixture', 'pod-a', false));
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(mocks.status).toHaveBeenCalledTimes(calls);
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it('ignores old pod responses after changing namespace and pod', async () => {
    let finishOld: (value: typeof samples) => void = () => undefined;
    mocks.history.mockImplementationOnce(() => new Promise<typeof samples>(resolve => { finishOld = resolve; }));
    const view = renderHook(({ namespace, pod }) => usePodMetricsHistory(namespace, pod, true), { initialProps: { namespace: 'first', pod: 'pod-a' } });
    await settle();
    view.rerender({ namespace: 'second', pod: 'pod-b' });
    await settle();
    expect(view.result.current.clickhouseMetrics?.cpu).toEqual([25]);
    await act(async () => { finishOld([{ cpu_m: 999, memory_mi: 999, timestamp_ms: 1 }]); });
    expect(view.result.current.clickhouseMetrics?.cpu).toEqual([25]);
    expect(mocks.history).toHaveBeenLastCalledWith('second', 'pod-b');
  });

  it('keeps slow requests single-flight and clamps the countdown at zero', async () => {
    mocks.status.mockResolvedValue({ clickhouseEnabled: true, scrapeInterval: 1 });
    let finish: (value: typeof samples) => void = () => undefined;
    mocks.history.mockImplementation(() => new Promise<typeof samples>(resolve => { finish = resolve; }));
    const { result } = renderHook(() => usePodMetricsHistory('fixture', 'pod-a', true));
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(mocks.history).toHaveBeenCalledTimes(1);
    expect(result.current.refreshCountdown).toBe(0);
    await act(async () => { finish(samples); });
    expect(result.current.isFetchingHistory).toBe(false);
    expect(result.current.clickhouseMetrics?.cpu).toEqual([25]);
  });

  it('finishes loading without starting polling when configuration is unavailable', async () => {
    mocks.status.mockRejectedValue(new Error('Fixture configuration unavailable'));
    const { result } = renderHook(() => usePodMetricsHistory('fixture', 'pod-a', true));
    await settle();
    expect(result.current.isCheckingConfig).toBe(false);
    expect(result.current.isFetchingHistory).toBe(false);
    expect(result.current.clickhouseMetrics).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(mocks.history).not.toHaveBeenCalled();
  });
});
