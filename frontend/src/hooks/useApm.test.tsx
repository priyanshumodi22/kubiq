// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useApm } from './useApm';

const mocks = vi.hoisted(() => ({ services: vi.fn() }));
vi.mock('../services/api', () => ({ apiClient: { getApmServices: mocks.services } }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('retains relative and absolute time ranges across polling and cleans up its timer', async () => {
    vi.useFakeTimers();
    mocks.services.mockResolvedValue([]);
    const view = renderHook(() => useApm());
    await act(async () => {});
    expect(mocks.services).toHaveBeenLastCalledWith({ timeRangeMs: '3600000' });
    await act(async () => { await view.result.current.refresh({ timeRangeMs: 86400000 }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(mocks.services).toHaveBeenLastCalledWith({ timeRangeMs: '86400000' });
    await act(async () => { await view.result.current.refresh({ timeRangeMs: 120000, fromMs: 1000, toMs: 121000 }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(mocks.services).toHaveBeenLastCalledWith({ timeRangeMs: '120000', fromMs: '1000', toMs: '121000' });
    const count = mocks.services.mock.calls.length;
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(mocks.services).toHaveBeenCalledTimes(count);
});
