// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemResourcesWidget } from './SystemResourcesWidget';
import { apiClient } from '../services/api';

vi.mock('../services/api', () => ({ apiClient: { getSystemStats: vi.fn() } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('system resource uptime identity', () => {
  it('updates day/hour/minute values without replacing their DOM elements', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
    const interval = vi.spyOn(globalThis, 'setInterval');
    const metrics = { cpuLoad: 20, memory: { total: 2 ** 30, active: 2 ** 29, used: 2 ** 29 }, uptime: 90060, disks: [] };
    vi.mocked(apiClient.getSystemStats).mockResolvedValue(metrics);
    const view = render(<SystemResourcesWidget />);
    await waitFor(() => expect(view.getByText('1d')).toBeTruthy());
    const day = view.getByText('1d');
    const hour = view.getByText('1h');
    const minute = view.getByText('1m');
    vi.mocked(apiClient.getSystemStats).mockResolvedValue({ ...metrics, uptime: 180120 });
    const poll = interval.mock.calls[0][0] as () => Promise<void>;
    await act(async () => { await poll(); });
    expect(view.getByText('2d')).toBe(day);
    expect(view.getByText('2h')).toBe(hour);
    expect(view.getByText('2m')).toBe(minute);
  });
});
