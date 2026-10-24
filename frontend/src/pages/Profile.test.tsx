// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Profile from './Profile';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(), success: vi.fn(), error: vi.fn(), update: vi.fn(async () => ({})),
  rename: vi.fn(async () => ({})), remove: vi.fn(async () => ({})),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ provider: 'native', roles: ['custom-first', 'kubiq-viewer', 'kubiq-admin'], refreshCurrentUser: mocks.refresh }) }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ success: mocks.success, error: mocks.error }) }));
vi.mock('../services/api', () => ({ apiClient: {
  setToken: vi.fn(), getCurrentUser: async () => ({ username: 'fixture', email: 'fixture@example.test', avatarUrl: '/avatar.png' }),
  getPasskeys: async () => [{ id: 'persisted-id', name: 'Fixture key', deviceType: 'singleDevice', createdAt: 1792800000000 }],
  updateProfile: mocks.update, renamePasskey: mocks.rename, deletePasskey: mocks.remove,
} }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('profile page integration', () => {
  it('retains unsaved input on rerender and reports server update failures through kubiq toasts', async () => {
    mocks.update.mockRejectedValueOnce({ response: { data: { message: 'Profile denied' } } });
    const view = render(<MemoryRouter><Profile /></MemoryRouter>);
    const username = await view.findByRole('textbox', { name: 'Username' });
    await waitFor(() => expect(username.getAttribute('value')).toBe('fixture'));
    fireEvent.change(username, { target: { value: 'unsaved' } });
    view.rerender(<MemoryRouter><Profile /></MemoryRouter>);
    expect(username.getAttribute('value')).toBe('unsaved');
    fireEvent.click(view.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Profile denied'));
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(username.getAttribute('value')).toBe('unsaved');
  });

  it('keeps first kubiq role selection and submits the labelled profile fields', async () => {
    const view = render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => expect(view.getByRole('textbox', { name: 'Username' }).getAttribute('value')).toBe('fixture'));
    expect(view.getByText('kubiq-viewer')).toBeTruthy();
    expect(view.getByRole('img', { name: "fixture's avatar" })).toBeTruthy();
    fireEvent.change(view.getByRole('textbox', { name: 'Username' }), { target: { value: 'updated' } });
    fireEvent.click(view.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ username: 'updated', email: 'fixture@example.test', avatarUrl: '/avatar.png' }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('renames the persisted passkey through the parent flow', async () => {
    const view = render(<MemoryRouter><Profile /></MemoryRouter>);
    await waitFor(() => expect(view.getByRole('textbox', { name: 'Username' }).getAttribute('value')).toBe('fixture'));
    fireEvent.click(view.getByRole('button', { name: 'Login & Security' }));
    fireEvent.click(view.getByRole('button', { name: 'Rename passkey Fixture key' }));
    fireEvent.change(view.getByRole('textbox', { name: 'Device Name' }), { target: { value: 'Renamed fixture' } });
    fireEvent.click(view.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(mocks.rename).toHaveBeenCalledWith('persisted-id', 'Renamed fixture'));
    expect(await view.findByRole('button', { name: 'Rename passkey Renamed fixture' })).toBeTruthy();
  });
});
