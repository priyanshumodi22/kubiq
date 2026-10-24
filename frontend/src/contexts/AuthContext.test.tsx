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
  keycloakLogin: vi.fn(), keycloakLogout: vi.fn(),
  keycloakToken: undefined as string | undefined,
}));
vi.mock('../services/api', () => ({ apiClient: {
  getAuthConfig: mocks.config, getCurrentUser: mocks.current, login: mocks.login,
  refreshNativeSession: mocks.refresh, setToken: mocks.setToken, clearToken: mocks.clearToken, register: mocks.register,
} }));
vi.mock('keycloak-js', () => ({ default: class {
  init = mocks.keycloakInit;
  updateToken = mocks.keycloakUpdate;
  login = mocks.keycloakLogin;
  logout = mocks.keycloakLogout;
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
  mocks.keycloakLogout.mockResolvedValue(undefined);
  mocks.register.mockResolvedValue(undefined);
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

  it('rotates a stored Native token and refreshes the server permission set', async () => {
    localStorage.setItem('kubiq_token', 'stored-fixture');
    mocks.current.mockResolvedValue({ ...initialUser, token: 'rotated-fixture' });
    const { latest } = mount();
    await waitFor(() => expect(latest().isAuthenticated).toBe(true));
    expect(mocks.setToken).toHaveBeenCalledWith('stored-fixture');
    expect(localStorage.getItem('kubiq_token')).toBe('rotated-fixture');
    mocks.current.mockResolvedValue({ ...initialUser, token: 'newer-fixture', permissions: ['services.read'] });
    await act(async () => { await latest().refreshCurrentUser(); });
    expect(localStorage.getItem('kubiq_token')).toBe('newer-fixture');
    expect(latest().hasPermission('users.manage')).toBe(false);
  });

  it('denies unconfirmed permissions when an older Native response cannot be refreshed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.login.mockResolvedValue({ token: 'fixture', user: { ...initialUser, permissions: undefined } });
    mocks.current.mockRejectedValue(new Error('Fixture permission service unavailable'));
    const { latest } = mount();
    await waitFor(() => expect(latest().isLoading).toBe(false));
    await act(async () => { await latest().loginNative({ username: 'fixture', password: 'fixture-only' }); });
    await waitFor(() => expect(latest().permissionsLoaded).toBe(true));
    expect(latest().hasRole('kubiq-admin')).toBe(true);
    expect(latest().hasPermission('users.manage')).toBe(false);
    expect(latest().permissions).toEqual([]);
  });

  it('updates SSO tokens while keeping permissions server-controlled and cleans up its timer', async () => {
    vi.useFakeTimers();
    mocks.config.mockResolvedValue({ provider: 'keycloak', url: 'https://sso.example.test', realm: 'kubiq', clientId: 'kubiq' });
    mocks.keycloakInit.mockResolvedValue(true); mocks.keycloakToken = 'sso-fixture';
    mocks.current.mockResolvedValue({ ...initialUser, permissions: ['services.read'] });
    const { latest, view } = mount();
    await act(async () => { await Promise.resolve(); });
    latest().loginKeycloak();
    expect(mocks.keycloakLogin).toHaveBeenCalledTimes(1);
    mocks.current.mockResolvedValue({ ...initialUser, permissions: [] });
    await act(async () => { await latest().refreshCurrentUser(); });
    expect(latest().hasPermission('services.read')).toBe(false);
    mocks.keycloakUpdate.mockImplementation(async () => { mocks.keycloakToken = 'refreshed-sso-fixture'; return true; });
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(mocks.setToken).toHaveBeenCalledWith('refreshed-sso-fixture');
    view.unmount();
    const calls = mocks.keycloakUpdate.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(mocks.keycloakUpdate).toHaveBeenCalledTimes(calls);
  });

  it('clears the local SSO session if provider logout fails', async () => {
    vi.useFakeTimers();
    mocks.config.mockResolvedValue({ provider: 'keycloak', url: 'https://sso.example.test', realm: 'kubiq', clientId: 'kubiq' });
    mocks.keycloakInit.mockResolvedValue(true); mocks.keycloakToken = 'sso-fixture';
    mocks.keycloakLogout.mockRejectedValue(new Error('Fixture logout failure'));
    const { latest, view } = mount();
    await act(async () => { await Promise.resolve(); });
    act(() => latest().logout());
    expect(view.getByText('Logging Out')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(mocks.keycloakLogout).toHaveBeenCalledWith({ redirectUri: expect.stringMatching(/\/login$/) });
    expect(latest().isAuthenticated).toBe(false);
    expect(latest().permissions).toEqual([]);
    expect(view.queryByText('Logging Out')).toBeNull();
  });

  it('registers without treating registration as an authenticated session', async () => {
    const { latest } = mount();
    await waitFor(() => expect(latest().isLoading).toBe(false));
    const input = { username: 'fixture', password: 'fixture-password-only' };
    await act(async () => { await latest().registerNative(input); });
    expect(mocks.register).toHaveBeenCalledWith(input);
    expect(latest().isAuthenticated).toBe(false);
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it('ignores an SSO initialization result that arrives after unmount', async () => {
    let finish: (authenticated: boolean) => void = () => undefined;
    mocks.config.mockResolvedValue({ provider: 'keycloak', url: 'https://sso.example.test', realm: 'kubiq', clientId: 'kubiq' });
    mocks.keycloakInit.mockImplementation(() => new Promise<boolean>(resolve => { finish = resolve; }));
    mocks.keycloakToken = 'late-sso-fixture';
    const { view } = mount();
    await act(async () => { await Promise.resolve(); });
    view.unmount();
    await act(async () => { finish(true); });
    expect(mocks.setToken).not.toHaveBeenCalled();
    expect(mocks.current).not.toHaveBeenCalled();
  });
});
