import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import Keycloak from 'keycloak-js';
import { apiClient } from '../services/api';
import { AuthContext } from './AuthContext';
import type { AuthContextType } from './AuthContext';
import type { AuthConfig, AuthProviderType, LoginCredentials, RegistrationInput, UserAccount, UserProfile } from '../types/auth';

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [nativeAuthEnabled, setNativeAuthEnabled] = useState(false);
  const [provider, setProvider] = useState<AuthProviderType | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const generation = useRef(0);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSession = useCallback(() => {
    generation.current++;
    localStorage.removeItem('kubiq_token');
    apiClient.clearToken();
    setIsAuthenticated(false);
    setUser(null);
    setRoles([]);
    setPermissions([]);
    setPermissionsLoaded(false);
    setProvider(null);
    setKeycloak(null);
  }, []);

  const loadPermissions = useCallback(async (version: number) => {
    try {
      const current = await apiClient.getCurrentUser();
      if (generation.current !== version) return;
      setPermissions(Array.isArray(current.permissions) ? current.permissions : []);
    } catch {
      if (generation.current !== version) return;
      console.warn('Permission refresh failed; denying permissions not confirmed by the server.');
      setPermissions([]);
    } finally {
      if (generation.current === version) setPermissionsLoaded(true);
    }
  }, []);

  const applyNativeUser = useCallback((account: UserAccount) => {
    const version = ++generation.current;
    setIsAuthenticated(true);
    setProvider('native');
    setUser({ id: account.id, username: account.username, email: account.email, name: account.name, avatarUrl: account.avatarUrl });
    const assigned = account.roles ?? [];
    setRoles([...new Set(account.role ? [account.role, ...assigned] : assigned)]);
    const loaded = Array.isArray(account.permissions);
    setPermissions(loaded ? account.permissions! : []);
    setPermissionsLoaded(loaded);
    if (!loaded) void loadPermissions(version);
  }, [loadPermissions]);

  const initializeNative = useCallback(async (active: () => boolean) => {
    const token = localStorage.getItem('kubiq_token');
    if (!token) return;
    apiClient.setToken(token);
    try {
      const account = await apiClient.getCurrentUser();
      if (!active()) return;
      if (account.token) { localStorage.setItem('kubiq_token', account.token); apiClient.setToken(account.token); }
      applyNativeUser(account);
    } catch {
      if (active()) clearSession();
    }
  }, [applyNativeUser, clearSession]);

  const initializeKeycloak = useCallback(async (config: AuthConfig, active: () => boolean) => {
    const kc = new Keycloak({ url: config.url, realm: config.realm, clientId: config.clientId });
    const base = import.meta.env.BASE_URL;
    const path = base.endsWith('/') ? base : base + '/';
    const authenticated = await kc.init({ onLoad: 'check-sso', silentCheckSsoRedirectUri: `${globalThis.location.origin}${path}silent-check-sso.html`, pkceMethod: 'S256', checkLoginIframe: false });
    if (!active()) return;
    setKeycloak(kc);
    if (!authenticated || !kc.token) return;
    const version = ++generation.current;
    apiClient.setToken(kc.token);
    setIsAuthenticated(true);
    setProvider('keycloak');
    const claims = kc.tokenParsed;
    setUser({ id: claims?.sub, username: claims?.preferred_username, email: claims?.email, name: claims?.name });
    const assigned = kc.clientId ? claims?.resource_access?.[kc.clientId]?.roles ?? [] : [];
    setRoles([...new Set(assigned)]);
    setPermissions([]);
    setPermissionsLoaded(false);
    void loadPermissions(version);
  }, [loadPermissions]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const config = await apiClient.getAuthConfig();
        if (!active) return;
        setAuthEnabled(config.provider === 'keycloak');
        setNativeAuthEnabled(config.provider === 'native');
        if (config.provider === 'native') await initializeNative(() => active);
        else if (config.provider === 'keycloak') await initializeKeycloak(config, () => active);
      } catch {
        console.warn('Authentication initialization failed; the application remains signed out.');
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void initialize();
    return () => { active = false; generation.current++; };
  }, [initializeNative, initializeKeycloak]);

  useEffect(() => {
    if (!isAuthenticated || provider !== 'native') return;
    let active = true;
    const refresh = async () => {
      const version = generation.current;
      try {
        const session = await apiClient.refreshNativeSession();
        if (!active || version !== generation.current) return;
        if (!session?.token || !session?.user) throw new Error('Native refresh returned no session.');
        localStorage.setItem('kubiq_token', session.token);
        apiClient.setToken(session.token);
        applyNativeUser(session.user);
      } catch {
        if (active && version === generation.current) clearSession();
      }
    };
    const timer = globalThis.setInterval(() => { void refresh(); }, 10 * 60 * 1000);
    return () => { active = false; globalThis.clearInterval(timer); };
  }, [isAuthenticated, provider, applyNativeUser, clearSession]);

  useEffect(() => {
    if (!isAuthenticated || provider !== 'keycloak' || !keycloak) return;
    let active = true;
    const timer = globalThis.setInterval(() => {
      void keycloak.updateToken(70).then(refreshed => {
        if (active && refreshed && keycloak.token) apiClient.setToken(keycloak.token);
      }).catch(() => { if (active) clearSession(); });
    }, 60000);
    return () => { active = false; globalThis.clearInterval(timer); };
  }, [isAuthenticated, provider, keycloak, clearSession]);

  useEffect(() => () => { if (logoutTimer.current !== null) globalThis.clearTimeout(logoutTimer.current); }, []);
  const loginKeycloak = useCallback(() => { if (keycloak) void keycloak.login(); }, [keycloak]);
  const loginWithToken = useCallback((token: string, account: UserAccount) => {
    localStorage.setItem('kubiq_token', token);
    apiClient.setToken(token);
    applyNativeUser(account);
  }, [applyNativeUser]);
  const loginNative = useCallback(async (credentials: LoginCredentials) => {
    const session = await apiClient.login(credentials);
    if (session.token) loginWithToken(session.token, session.user);
  }, [loginWithToken]);
  const registerNative = useCallback(async (input: RegistrationInput) => { await apiClient.register(input); }, []);
  const refreshCurrentUser = useCallback(async () => {
    if (!isAuthenticated) return null;
    const version = generation.current;
    const account = await apiClient.getCurrentUser();
    if (version !== generation.current) return null;
    if (provider === 'native') {
      if (account.token) { localStorage.setItem('kubiq_token', account.token); apiClient.setToken(account.token); }
      applyNativeUser(account);
    } else {
      setPermissions(Array.isArray(account.permissions) ? account.permissions : []);
      setPermissionsLoaded(true);
    }
    return account;
  }, [isAuthenticated, provider, applyNativeUser]);
  const logout = useCallback(() => {
    setIsLoggingOut(true);
    const base = import.meta.env.BASE_URL;
    const path = base.endsWith('/') ? base : base + '/';
    const loginUrl = `${globalThis.location.origin}${path}login`;
    if (logoutTimer.current !== null) globalThis.clearTimeout(logoutTimer.current);
    logoutTimer.current = globalThis.setTimeout(() => {
      if (provider === 'keycloak' && keycloak) {
        void keycloak.logout({ redirectUri: loginUrl }).catch(() => { clearSession(); setIsLoggingOut(false); });
      } else {
        clearSession();
        globalThis.location.href = loginUrl;
      }
    }, 1500);
  }, [provider, keycloak, clearSession]);
  const hasRole = useCallback((role: string) => roles.includes(role), [roles]);
  const hasPermission = useCallback((permission: string) => permissions.includes('*') || permissions.includes(permission), [permissions]);
  const value = useMemo<AuthContextType>(() => ({ isAuthenticated, isLoading, authEnabled, nativeAuthEnabled, provider, user, roles, permissions, permissionsLoaded, loginKeycloak, loginNative, loginWithToken, registerNative, refreshCurrentUser, logout, keycloak, hasRole, hasPermission }), [isAuthenticated, isLoading, authEnabled, nativeAuthEnabled, provider, user, roles, permissions, permissionsLoaded, loginKeycloak, loginNative, loginWithToken, registerNative, refreshCurrentUser, logout, keycloak, hasRole, hasPermission]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      {isLoggingOut && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-bg-surface border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl scale-100 animate-in zoom-in-95 duration-300 flex flex-col items-center">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-6 animate-bounce"><LogOut className="w-8 h-8 text-primary" /></div>
            <h2 className="text-2xl font-bold bg-linear-to-r from-white to-white/60 bg-clip-text text-transparent mb-2">Logging Out</h2>
            <p className="text-text-dim">See you again soon! 👋</p>
            <div className="mt-8 w-full bg-white/5 rounded-full h-1 overflow-hidden"><div className="h-full bg-primary animate-progress-indeterminate"></div></div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}
