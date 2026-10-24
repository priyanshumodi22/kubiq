// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Header, { UserAvatar } from './Header';

const mocks = vi.hoisted(() => ({ canReadSystem: false, pro: vi.fn(async () => ({ active: true })) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, user: { username: 'fixture' }, roles: ['custom-user-manager'], logout: vi.fn(), hasPermission: (permission: string) => permission === 'system.read' && mocks.canReadSystem }) }));
vi.mock('../services/api', () => ({ apiClient: { getProStatus: mocks.pro } }));
vi.mock('./NotificationConfigModal', () => ({ NotificationConfigModal: () => null }));

afterEach(() => { cleanup(); mocks.canReadSystem = false; vi.clearAllMocks(); });

describe('header avatar', () => {
  it('retains the image element while parent data changes and supplies a concise accessible name', () => {
    const view = render(<UserAvatar avatarUrl="/avatar.png" initials="PM" />);
    const image = view.getByRole('img', { name: 'Your avatar' });
    view.rerender(<UserAvatar avatarUrl="/next-avatar.png" initials="KM" className="w-10 h-10" />);
    expect(view.getByRole('img', { name: 'Your avatar' })).toBe(image);
    expect(image.getAttribute('src')).toBe('/next-avatar.png');
  });

  it('uses the latest initials when no avatar is configured', () => {
    const view = render(<UserAvatar initials="PM" />);
    expect(view.queryByRole('img')).toBeNull();
    expect(view.getByText('PM')).toBeTruthy();
    view.rerender(<UserAvatar avatarUrl="" initials="KM" />);
    expect(view.getByText('KM')).toBeTruthy();
  });
});

describe('header system permission dependencies', () => {
  it('does not request protected system status for a management-only user', () => {
    render(<MemoryRouter><Header /></MemoryRouter>);
    expect(mocks.pro).not.toHaveBeenCalled();
  });

  it('loads Pro status with system.read and clears it after permission revocation', async () => {
    mocks.canReadSystem = true;
    const view = render(<MemoryRouter><Header /></MemoryRouter>);
    await waitFor(() => expect(view.getByRole('button', { name: 'Open kubiq Pro details' })).toBeTruthy());
    expect(mocks.pro).toHaveBeenCalledTimes(1);
    mocks.canReadSystem = false;
    view.rerender(<MemoryRouter><Header /></MemoryRouter>);
    expect(view.queryByRole('button', { name: 'Open kubiq Pro details' })).toBeNull();
    expect(mocks.pro).toHaveBeenCalledTimes(1);
  });
});
