// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SystemAdministration from './SystemAdministration';
import { apiClient } from '../services/api';
const mocks = vi.hoisted(() => ({ can: vi.fn(), createRole: vi.fn(), createUser: vi.fn(), saveDisks: vi.fn(), saveApm: vi.fn(), diskConfig: vi.fn(), health: vi.fn() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: mocks.can }) }));
vi.mock('../components/KubiAiSettings', () => ({ KubiAiSettings: () => null }));
vi.mock('../components/KubiAvatar', () => ({ KubiAvatar: () => null }));
vi.mock('../services/api', () => ({ apiClient: {
  getAuthConfig: vi.fn(async () => ({ provider: 'native' })), getProStatus: vi.fn(async () => ({ active: false })),
  getKubiStatus: vi.fn(async () => ({})), getSystemStats: vi.fn(async () => ({})), getAuditLogs: vi.fn(async () => []),
  getRbacRoles: vi.fn(async () => [{ id: 'viewer', name: 'kubiq-viewer', description: 'Viewer', permissions: ['logs.read'], builtIn: true }]), getRbacPermissions: vi.fn(async () => [{ key: 'logs.read', label: 'Read logs' }, { key: 'logs.export', label: 'Export logs' }]),
  getUsers: vi.fn(async () => []), createUser: mocks.createUser, getKeycloakHealth: mocks.health,
  createRbacRole: mocks.createRole, getMonitoredDisksConfig: mocks.diskConfig,
  getApmConfig: vi.fn(async () => ({ ignoredRoutes: ['/healthz'] })), updateMonitoredDisks: mocks.saveDisks, updateApmConfig: mocks.saveApm,
} }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.can.mockReturnValue(true);
  mocks.createRole.mockImplementation(async input => ({ id: 'created', ...input }));
  mocks.createUser.mockImplementation(async input => ({ id: 'new-user', ...input }));
  mocks.diskConfig.mockResolvedValue(['/', '/data']); mocks.health.mockResolvedValue({ selected: false });
  mocks.saveDisks.mockResolvedValue({}); mocks.saveApm.mockResolvedValue({});
});
afterEach(cleanup);
describe('system administration compatibility', () => {
  it('loads configuration-only setup without requesting live metrics or audit history', async () => {
    mocks.can.mockImplementation(permission => permission === 'system.configure');
    const view = render(<SystemAdministration />);
    await waitFor(() => expect((view.getByLabelText('Monitored mounts (comma-separated)') as HTMLInputElement).value).toBe('/, /data'));
    expect(apiClient.getSystemStats).not.toHaveBeenCalled();
    expect(apiClient.getAuditLogs).not.toHaveBeenCalled();
    expect(view.queryByRole('button', { name: 'Users' })).toBeNull();
    expect(view.getByRole('button', { name: 'Save configuration' })).toBeTruthy();
  });

  it('loads user-role assignments without requesting role editing permissions or overview telemetry', async () => {
    mocks.can.mockImplementation(permission => permission === 'users.manage');
    const view = render(<SystemAdministration />);
    await waitFor(() => expect(view.getByRole('button', { name: 'Create user' })).toBeTruthy());
    expect(apiClient.getRbacRoles).toHaveBeenCalled();
    expect(apiClient.getRbacPermissions).not.toHaveBeenCalled();
    expect(apiClient.getSystemStats).not.toHaveBeenCalled();
    expect(apiClient.getAuditLogs).not.toHaveBeenCalled();
    expect(view.queryByRole('button', { name: 'Roles & permissions' })).toBeNull();
  });

  it('creates a role with exactly the selected permission set', async () => {
    const view = render(<SystemAdministration />);
    fireEvent.click(view.getByRole('button', { name: 'Roles & permissions' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'Save role' })).toBeTruthy());
    fireEvent.change(view.getByPlaceholderText('Role name, e.g. incident-reader'), { target: { value: 'incident-reader' } });
    fireEvent.change(view.getByPlaceholderText('Short purpose'), { target: { value: 'Read incident logs' } });
    fireEvent.click(view.getByRole('checkbox', { name: /logs.read/ }));
    fireEvent.click(view.getByRole('checkbox', { name: /logs.export/ }));
    fireEvent.click(view.getByRole('checkbox', { name: /logs.export/ }));
    fireEvent.click(view.getByRole('button', { name: 'Save role' }));
    await waitFor(() => expect(mocks.createRole).toHaveBeenCalledWith({ name: 'incident-reader', description: 'Read incident logs', permissions: ['logs.read'] }));
    await waitFor(() => expect(view.getByText('Role permissions saved and audited.')).toBeTruthy());
  });
  it('loads the existing monitored disk array without silently clearing it', async () => {
    const view = render(<SystemAdministration />);
    fireEvent.click(view.getByRole('button', { name: 'System configuration' }));
    await waitFor(() => expect((view.getByLabelText('Monitored mounts (comma-separated)') as HTMLInputElement).value).toBe('/, /data'));
    expect((view.getByLabelText('Ignored APM routes (one per line)') as HTMLTextAreaElement).value).toBe('/healthz');
  });
  it('preserves unchanged mounts and parses edited APM exclusions on save', async () => {
    const view = render(<SystemAdministration />);
    fireEvent.click(view.getByRole('button', { name: 'System configuration' }));
    await waitFor(() => expect((view.getByLabelText('Ignored APM routes (one per line)') as HTMLTextAreaElement).value).toBe('/healthz'));
    fireEvent.change(view.getByLabelText('Ignored APM routes (one per line)'), { target: { value: ' /healthz \n\n /ready ' } });
    fireEvent.click(view.getByRole('button', { name: 'Save configuration' }));
    await waitFor(() => expect(mocks.saveDisks).toHaveBeenCalledWith(['/', '/data']));
    expect(mocks.saveApm).toHaveBeenCalledWith({ ignoredRoutes: ['/healthz', '/ready'] });
  });
  it('retains compatibility with the older object-shaped disk configuration', async () => {
    mocks.diskConfig.mockResolvedValue({ mounts: ['/archive'] });
    const view = render(<SystemAdministration />);
    fireEvent.click(view.getByRole('button', { name: 'System configuration' }));
    await waitFor(() => expect((view.getByLabelText('Monitored mounts (comma-separated)') as HTMLInputElement).value).toBe('/archive'));
  });
  it('keeps selected role assignments when creating a user', async () => {
    const view = render(<SystemAdministration />);
    fireEvent.click(view.getByRole('button', { name: 'Users' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'Create user' })).toBeTruthy());
    fireEvent.click(view.getByRole('button', { name: 'Create user' }));
    fireEvent.change(view.getByPlaceholderText('Username'), { target: { value: 'operator' } });
    fireEvent.change(view.getByPlaceholderText('Temporary password (12+ chars)'), { target: { value: 'FixturePassword123!' } });
    fireEvent.click(view.getByRole('checkbox', { name: 'kubiq-viewer' }));
    fireEvent.submit(view.getByPlaceholderText('Username').closest('form')!);
    await waitFor(() => expect(mocks.createUser).toHaveBeenCalledWith({ username: 'operator', email: '', password: 'FixturePassword123!', roles: ['kubiq-viewer'] }));
  });
  it.each([
    [{ selected: false, reachable: true }, 'Not selected for this deployment.'],
    [{ selected: true, reachable: true, configured: true }, 'Selected, configured, and reachable.'],
    [{ selected: true, reachable: false, configured: true }, 'Configured but unreachable. No provisioning actions are attempted.'],
    [{ selected: true, reachable: false, configured: false }, 'Selected but the server-only service account is not configured.'],
  ])('retains Keycloak health precedence for %o', async (health, expected) => {
    mocks.health.mockResolvedValue(health);
    const view = render(<SystemAdministration />);
    fireEvent.click(view.getByRole('button', { name: 'Authentication' }));
    await waitFor(() => expect(view.getByText(expected)).toBeTruthy());
  });
});
