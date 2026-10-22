// @vitest-environment jsdom
import { useEffect } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from './AuthContext';
import { AuthProvider } from './AuthProvider';

const mocks = vi.hoisted(() => ({
  config: vi.fn(), current: vi.fn(), login: vi.fn(), refresh: vi.fn(),
  setToken: vi.fn(), clearToken: vi.fn(), register: vi.fn(),
  keycloakInit: vi.fn(),
  keycloakUpdate: vi.fn(),
  keycloakToken: undefined as string | undefined,
}));
vi.mock('../services/api', () => ({ apiClient: {
  getAuthConfig: mocks.config, getCurrentUser: mocks.current, login: mocks.login,
  refreshNativeSession: mocks.refresh, setToken: mocks.setToken, clearToken: mocks.clearToken, register: mocks.register,
} }));
vi.mock('keycloak-js', () => ({ default: class {
  init = mocks.keycloakInit;
  updateToken = mocks.keycloakUpdate;
  clientId = 'kubiq';
  get token() { return mocks.keycloakToken; }
  tokenParsed = { sub: 'sso-1', preferred_username: 'reader', realm_access: { roles: ['kubiq-admin'] }, resource_access: { kubiq: { roles: ['kubiq-viewer'] } } };
} }));

type Auth = ReturnType<typeof useAuth>;
function Probe({ capture }: Readonly<{ capture: (context: Auth) => void }>) {
  const context = useAuth();
  useEffect(() => { capture(context); }, [capture, context]);
  return <span>{context.isLoading ? 'Loading' : 'Ready'}</span>;
}
const initialUser = { id: 'u-1', username: 'operator', role: 'kubiq-admin', roles: ['kubiq-admin'], permissions: ['*'] };
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.config.mockResolvedValue({ provider: 'native' });
  mocks.current.mockResolvedValue(initialUser);
  mocks.login.mockResolvedValue({ token: 'initial-test-token', user: initialUser });
  mocks.keycloakInit.mockResolvedValue(false);
  mocks.keycloakUpdate.mockResolvedValue(false);
  mocks.keycloakToken = undefined;
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

function mount() {
  const capture = vi.fn<(context: Auth) => void>();
  const view = render(<AuthProvider><Probe capture={capture} /></AuthProvider>);
  const latest = () => {
    const context = capture.mock.calls.at(-1)?.[0];
    if (!context) throw new Error('Context not rendered');
    return context;
  };
  return { view, capture, latest };
}

describe('authentication lifecycle and permission refresh', () => {
  it('refreshes Native roles and permissions without leaving permission loading stuck', async () => {
    vi.useFakeTimers();
    const { latest } = mount();
    await act(async () => { await Promise.resolve(); });
    expect(latest().isLoading).toBe(false);
    await act(async () => { await latest().loginNative({ username: 'operator', password: 'test-only' }); });
    expect(latest().permissionsLoaded).toBe(true);
    expect(latest().hasPermission('users.manage')).toBe(true);
    mocks.refresh.mockResolvedValue({ token: 'refreshed-test-token', user: { ...initialUser, role: 'kubiq-viewer', roles: ['kubiq-viewer'], permissions: ['services.read'] } });
    await act(async () => { await vi.advanceTimersByTimeAsync(600000); });
    expect(latest().roles).toEqual(['kubiq-viewer']);
    expect(latest().permissionsLoaded).toBe(true);
    expect(latest().hasPermission('users.manage')).toBe(false);
    expect(localStorage.getItem('kubiq_token')).toBe('refreshed-test-token');
  });
  it('clears a disabled or invalid Native session on refresh failure', async () => {
    vi.useFakeTimers();
    const { latest } = mount();
    await act(async () => { await Promise.resolve(); });
    expect(latest().isLoading).toBe(false);
    await act(async () => { await latest().loginNative({ username: 'operator', password: 'test-only' }); });
    mocks.refresh.mockRejectedValue(new Error('Account disabled'));
    await act(async () => { await vi.advanceTimersByTimeAsync(600000); });
    expect(latest().isAuthenticated).toBe(false);
    expect(latest().hasPermission('users.manage')).toBe(false);
    expect(latest().roles).toEqual([]);
    expect(localStorage.getItem('kubiq_token')).toBeNull();
  });
  it('does not fall back to a stored Native token when Keycloak is selected', async () => {
    localStorage.setItem('kubiq_token', 'old-native-token');
    mocks.config.mockResolvedValue({ provider: 'keycloak', url: 'https://sso.example.test', realm: 'kubiq', clientId: 'kubiq' });
    const { latest } = mount();
    await waitFor(() => expect(latest().isLoading).toBe(false));
    expect(latest().isAuthenticated).toBe(false);
    expect(mocks.current).not.toHaveBeenCalled();
    expect(mocks.login).not.toHaveBeenCalled();
  });
  it('preserves context identity during unrelated provider rerenders', async () => {
    const { latest, view, capture } = mount();
    await waitFor(() => expect(latest().isLoading).toBe(false));
    const context = latest();
    view.rerender(<AuthProvider><Probe capture={capture} /></AuthProvider>);
    expect(latest()).toBe(context);
  });
  it('supports older Native responses while denying permissions until the server confirms them', async () => {
    mocks.login.mockResolvedValue({ token: 'old-format-session', user: { ...initialUser, permissions: undefined } });
    mocks.current.mockResolvedValue({ ...initialUser, permissions: ['services.read'] });
    const { latest } = mount();
    await waitFor(() => expect(latest().isLoading).toBe(false));
    await act(async () => { await latest().loginNative({ username: 'operator', password: 'test-only' }); });
    await waitFor(() => expect(latest().permissionsLoaded).toBe(true));
    expect(latest().hasPermission('services.read')).toBe(true);
    expect(latest().hasPermission('users.manage')).toBe(false);
  });
  it('does not let a late permission response regrant access to a newer session', async () => {
    let resolve: (value: typeof initialUser) => void = () => undefined;
    mocks.current.mockReturnValue(new Promise<typeof initialUser>(done => { resolve = done; }));
    mocks.login.mockResolvedValue({ token: 'first', user: { ...initialUser, permissions: undefined } });
    const { latest } = mount();
    await waitFor(() => expect(latest().isLoading).toBe(false));
    await act(async () => { await latest().loginNative({ username: 'operator', password: 'test-only' }); });
    expect(latest().permissionsLoaded).toBe(false);
    act(() => { latest().loginWithToken('newer', { ...initialUser, role: 'kubiq-viewer', roles: ['kubiq-viewer'], permissions: ['services.read'] }); });
    await act(async () => { resolve(initialUser); });
    expect(latest().hasPermission('users.manage')).toBe(false);
    expect(latest().permissionsLoaded).toBe(true);
  });
  it('uses only client roles for Keycloak and clears permissions on refresh failure', async () => {
    vi.useFakeTimers();
    mocks.config.mockResolvedValue({ provider: 'keycloak', url: 'https://sso.example.test', realm: 'kubiq', clientId: 'kubiq' });
    mocks.keycloakInit.mockResolvedValue(true);
    mocks.keycloakToken = 'sso-test-token';
    mocks.current.mockResolvedValue({ ...initialUser, permissions: ['services.read'] });
    const { latest } = mount();
    await act(async () => { await Promise.resolve(); });
    expect(latest().hasRole('kubiq-admin')).toBe(false);
    expect(latest().hasRole('kubiq-viewer')).toBe(true);
    expect(latest().hasPermission('services.read')).toBe(true);
    mocks.keycloakUpdate.mockRejectedValue(new Error('SSO expired'));
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(latest().isAuthenticated).toBe(false);
    expect(latest().hasPermission('services.read')).toBe(false);
  });
});
