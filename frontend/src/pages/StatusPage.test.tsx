// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StatusPage from './StatusPage';
const mocks = vi.hoisted(() => ({ getStatus: vi.fn() }));
vi.mock('react-router-dom', () => ({ useParams: () => ({ slug: 'public' }), useNavigate: () => vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: false }) }));
vi.mock('../components/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('../components/StatusPageConfigModal', () => ({ StatusPageConfigModal: () => null }));
vi.mock('../services/api', () => ({ apiClient: { getPublicStatus: mocks.getStatus } }));
const now = 1_800_000_000_000;
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(Date, 'now').mockReturnValue(now); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const history = (count: number) => Array.from({ length: count }, (_unused, index) => ({ timestamp: now - 30_000 - index, responseTime: 20, success: index !== 0, status: index === 0 ? 500 : 200 }));

describe('public status presentation compatibility', () => {
  it.each([
    [{ response: { status: 404 } }, 'Status page not found or disabled.'],
    [new Error('Offline'), 'Failed to load status page.'],
    [null, 'Failed to load status page.'],
  ])('shows unavailable status for a failed request', async (failure, message) => {
    mocks.getStatus.mockRejectedValue(failure);
    const view = render(<StatusPage />);
    await waitFor(() => expect(view.getByText(message as string)).toBeTruthy());
    expect(view.queryByText('All Systems Operational')).toBeNull();
  });

  it.each([[50, '98.0%', 'text-success'], [10, '90.0%', 'text-warning'], [1, '0.0%', 'text-error']] as const)('retains uptime threshold for %s checks', async (count, uptime, color) => {
    mocks.getStatus.mockResolvedValue({ pageTitle: 'Public status', refreshInterval: 60, lastUpdated: new Date(now).toISOString(), services: [{ name: 'api', currentStatus: 'healthy', history: history(count) }] });
    const view = render(<StatusPage />);
    await waitFor(() => expect(view.getByText(uptime)).toBeTruthy());
    expect(view.getByText(uptime).className).toContain(color);
    expect(view.container.querySelector('.h-3.gap-\\[2px\\]')?.children).toHaveLength(60);
    expect(view.queryByRole('button', { name: 'Page Settings' })).toBeNull();
  });

  it('keeps empty history, service filtering and public titles intact', async () => {
    mocks.getStatus.mockResolvedValue({ pageTitle: 'Public status', refreshInterval: 60, lastUpdated: new Date(now).toISOString(), services: [{ name: 'api', currentStatus: 'healthy', history: [] }] });
    const view = render(<StatusPage />);
    await waitFor(() => expect(view.getByRole('heading', { name: 'Public status' })).toBeTruthy());
    expect(view.getByText('100.0%')).toBeTruthy();
    expect(view.getByText('All Systems Operational')).toBeTruthy();
    fireEvent.change(view.getByPlaceholderText('Search services...'), { target: { value: 'missing' } });
    expect(view.queryByRole('heading', { name: 'api' })).toBeNull();
  });
});
