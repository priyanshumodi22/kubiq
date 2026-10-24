// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminUsers from './AdminUsers';

const mocks = vi.hoisted(() => ({ allowed: true, loading: false, users: vi.fn(), namespaces: vi.fn(), scope: vi.fn(), role: vi.fn(), status: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => mocks.allowed, isLoading: mocks.loading, user: { id: 'self' } }) }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ success: mocks.success, error: mocks.error }) }));
vi.mock('../services/api', () => ({ apiClient: { getUsers: mocks.users, getKubernetesNamespaces: mocks.namespaces, updateUserAllowedNamespaces: mocks.scope, updateUserRole: mocks.role, updateUserStatus: mocks.status } }));
vi.mock('../components/Header', () => ({ default: () => null }));
vi.mock('../components/Footer', () => ({ default: () => null }));
const renderPage = () => render(<MemoryRouter><AdminUsers /></MemoryRouter>);
beforeEach(() => {
  vi.resetAllMocks(); mocks.allowed = true; mocks.loading = false;
  mocks.users.mockResolvedValue([
    { id: 'self', username: 'Current admin', role: 'kubiq-admin', enabled: true },
    { id: 'viewer', username: 'Fixture viewer', role: 'kubiq-viewer', enabled: true, allowedNamespaces: ['default'] },
  ]);
  mocks.namespaces.mockResolvedValue(['default', 'apps']);
  mocks.scope.mockResolvedValue(undefined); mocks.role.mockResolvedValue(undefined); mocks.status.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('user management compatibility and authorization', () => {
  it('does not request protected setup data while unauthorized or authentication is loading', () => {
    mocks.allowed = false;
    const view = renderPage();
    expect(mocks.users).not.toHaveBeenCalled();
    expect(mocks.namespaces).not.toHaveBeenCalled();
    view.unmount();
    mocks.allowed = true; mocks.loading = true;
    renderPage();
    expect(mocks.users).not.toHaveBeenCalled();
  });

  it('keeps self-protection and uses a native button for mobile details', async () => {
    const view = renderPage();
    const expand = await view.findByRole('button', { name: 'Expand Fixture viewer details' });
    fireEvent.click(expand);
    expect(expand.getAttribute('aria-expanded')).toBe('true');
    expect(expand.closest('tr')!.querySelectorAll('td')[1].classList.contains('flex')).toBe(true);
    fireEvent.click(expand);
    expect(expand.closest('tr')!.querySelectorAll('td')[1].classList.contains('hidden')).toBe(true);
    const self = view.getByRole('button', { name: 'Expand Current admin details' }).closest('tr')!;
    expect((within(self).getByRole('button', { name: 'Admin' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(self).getByRole('button', { name: 'Active' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(self).queryByTitle('Delete User')).toBeNull();
  });

  it('normalizes custom namespace scope and saves only the selected user', async () => {
    const view = renderPage();
    await view.findByRole('button', { name: 'Expand Fixture viewer details' });
    fireEvent.click(view.getByTitle('Click to edit allowed namespaces from live cluster API'));
    fireEvent.change(view.getByPlaceholderText('Custom namespace...'), { target: { value: ' APPS, default, extra ' } });
    fireEvent.click(view.getByRole('button', { name: 'Add' }));
    fireEvent.click(view.getByRole('button', { name: 'Remove default namespace' }));
    fireEvent.click(view.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.scope).toHaveBeenCalledWith('viewer', ['apps', 'extra']));
    expect(mocks.success).toHaveBeenCalledWith('Allowed namespaces updated successfully!');
  });

  it('preserves status and role mutations and allows dismissal without changing a role', async () => {
    const view = renderPage();
    await view.findByRole('button', { name: 'Expand Fixture viewer details' });
    const row = view.getByRole('button', { name: 'Expand Fixture viewer details' }).closest('tr')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Active' }));
    await waitFor(() => expect(mocks.status).toHaveBeenCalledWith('viewer', false));
    fireEvent.click(within(row).getByRole('button', { name: 'Viewer' }));
    fireEvent.click(view.getByRole('button', { name: 'Close role choices' }));
    expect(mocks.role).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole('button', { name: 'Viewer' }));
    fireEvent.click(view.getAllByRole('button', { name: 'Admin' }).find(button => !(button as HTMLButtonElement).disabled)!);
    await waitFor(() => expect(mocks.role).toHaveBeenCalledWith('viewer', 'kubiq-admin'));
  });
});
