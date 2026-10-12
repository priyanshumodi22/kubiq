import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { LogOut } from 'lucide-react';
import Keycloak from 'keycloak-js';
import { apiClient } from '../services/api';

export type AuthProviderType = 'keycloak' | 'native';

export interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  authEnabled: boolean; // Keycloak enabled
  nativeAuthEnabled: boolean; // Native auth enabled
  provider: AuthProviderType | null;
  user: any | null;
  roles: string[];
  permissions: string[];
  permissionsLoaded: boolean;
  
  // Actions
  loginKeycloak: () => void;
  loginNative: (credentials: any) => Promise<void>;
  loginWithToken: (token: string, user: any) => void;
  registerNative: (data: any) => Promise<void>;
  refreshCurrentUser: () => Promise<any | null>;
  logout: () => void;
  
  // Helpers
  keycloak: Keycloak | null;
  hasRole: (role: string) => boolean;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Global state for singleton persistence across HMR
// @ts-ignore
let globalKeycloak: Keycloak | null = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [nativeAuthEnabled, setNativeAuthEnabled] = useState(false);
  const [provider, setProvider] = useState<AuthProviderType | null>(null);
  const [user, setUser] = useState<any | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);
  const nativeRefreshTimer = useRef<number | null>(null);
  const keycloakRefreshTimer = useRef<number | null>(null);

  useEffect(() => {
    initAuth();
    return () => {
      if (nativeRefreshTimer.current !== null) window.clearInterval(nativeRefreshTimer.current);
      if (keycloakRefreshTimer.current !== null) window.clearInterval(keycloakRefreshTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    setPermissionsLoaded(false);
    apiClient.getCurrentUser().then(currentUser => {
      setPermissions(Array.isArray(currentUser.permissions) ? currentUser.permissions : []);
    }).catch(() => setPermissions([])).finally(() => setPermissionsLoaded(true));
  }, [isAuthenticated]);

  // Native JWTs are refreshed from the current server-side user record. This
  // means a role, namespace, or disabled-account change takes effect in an
  // active browser session instead of waiting for the original token to expire.
  useEffect(() => {
    if (!isAuthenticated || provider !== 'native') return;

    const refresh = async () => {
      try {
        const session = await apiClient.refreshNativeSession();
        if (!session?.token || !session?.user) throw new Error('Native refresh returned no session.');
        localStorage.setItem('kubiq_token', session.token);
        apiClient.setToken(session.token);
        handleNativeSuccess(session.user);
      } catch {
        // A disabled/deleted account or invalid token must not keep its old UI
        // permissions. Clear only the local Native session and return to login.
        localStorage.removeItem('kubiq_token');
        apiClient.clearToken();
        setIsAuthenticated(false);
        setUser(null);
        setRoles([]);
        setPermissions([]);
        setPermissionsLoaded(false);
        setProvider(null);
      }
    };

    nativeRefreshTimer.current = window.setInterval(() => { void refresh(); }, 10 * 60 * 1000);
    return () => {
      if (nativeRefreshTimer.current !== null) window.clearInterval(nativeRefreshTimer.current);
      nativeRefreshTimer.current = null;
    };
  }, [isAuthenticated, provider]);

  const initAuth = async () => {
    try {
      // 1. Get Config
      const config = await apiClient.getAuthConfig();
      setAuthEnabled(config.provider === 'keycloak');
      setNativeAuthEnabled(config.provider === 'native');

      // 2. Try Keycloak (if enabled)
      let kcAuthenticated = false;
      if (config.provider === 'keycloak') {
          const kc = new Keycloak({
            url: config.url,
            realm: config.realm,
            clientId: config.clientId,
          });

          const silentCheckSsoUrl = `${window.location.origin}${
            import.meta.env.BASE_URL.endsWith('/')
              ? import.meta.env.BASE_URL
              : import.meta.env.BASE_URL + '/'
          }silent-check-sso.html`;

          kcAuthenticated = await kc.init({
            onLoad: 'check-sso',
            silentCheckSsoRedirectUri: silentCheckSsoUrl,
            pkceMethod: 'S256',
            checkLoginIframe: false,
          });

          if (kcAuthenticated) {
             handleKeycloakSuccess(kc);
             setIsLoading(false);
             return; 
          }
          
          setKeycloak(kc); // Save instance even if not authenticated (for login())
      }

      // 3. Try Native (if not Keycloak authenticated)
      if (!kcAuthenticated && config.provider === 'native') {
          const storedToken = localStorage.getItem('kubiq_token');
          if (storedToken) {
              apiClient.setToken(storedToken);
              try {
                  const currentUser = await apiClient.getCurrentUser();
                  
                  // If backend returned a fresh token (e.g. roles changed), update it
                  if (currentUser.token) {
                      localStorage.setItem('kubiq_token', currentUser.token);
                      apiClient.setToken(currentUser.token);
                  }

                  handleNativeSuccess(currentUser); // Fixed: removed token arg
                  setIsLoading(false);
                  return;
              } catch (e) {
                  console.warn('Native token invalid', e);
                  localStorage.removeItem('kubiq_token');
                  apiClient.clearToken();
              }
          }
      }

    } catch (error) {
       console.error('Auth initialization failed', error);
    } finally {
       setIsLoading(false);
    }
  };

  const handleKeycloakSuccess = (kc: Keycloak) => {
      setKeycloak(kc);
      setIsAuthenticated(true);
      setProvider('keycloak');
      apiClient.setToken(kc.token!);
      
      const tokenParsed = kc.tokenParsed as any;
      const u = {
          id: tokenParsed?.sub,
          username: tokenParsed?.preferred_username,
          email: tokenParsed?.email,
          name: tokenParsed?.name,
      };
      setUser(u);

      const r: string[] = [];
       const clientId = kc.clientId;
       if (clientId && tokenParsed?.resource_access?.[clientId]?.roles) {
           r.push(...tokenParsed.resource_access[clientId].roles);
       }
       setRoles([...new Set(r)]);
       setPermissions([]);
       setPermissionsLoaded(false);
       
       // Periodically refresh token
       if (keycloakRefreshTimer.current !== null) window.clearInterval(keycloakRefreshTimer.current);
       keycloakRefreshTimer.current = window.setInterval(() => {
           kc.updateToken(70).then(refreshed => {
               if (refreshed) apiClient.setToken(kc.token!);
           });
       }, 60000);
  };

  const handleNativeSuccess = (userData: any) => {
      setIsAuthenticated(true);
      setProvider('native');
      setUser({
          id: userData.id,
          username: userData.username,
          email: userData.email,
          name: userData.name,
          avatarUrl: userData.avatarUrl
      });
      const r: string[] = [];
      if (userData.role) r.push(userData.role);
      if (userData.roles && Array.isArray(userData.roles)) r.push(...userData.roles);
      setRoles(r);
      setPermissions(Array.isArray(userData.permissions) ? userData.permissions : []);
      setPermissionsLoaded(false);
      // Token is already set in apiClient before calling this
  };

  const loginKeycloak = () => {
    if (keycloak) keycloak.login();
  };

  const loginNative = async (credentials: any) => {
      const res = await apiClient.login(credentials);
      if (res.token) {
          localStorage.setItem('kubiq_token', res.token);
          apiClient.setToken(res.token);
          handleNativeSuccess(res.user);
      }
  };

  const loginWithToken = (token: string, user: any) => {
      localStorage.setItem('kubiq_token', token);
      apiClient.setToken(token);
      handleNativeSuccess(user);
  };

  const refreshCurrentUser = async () => {
    if (!isAuthenticated) return null;
    const currentUser = await apiClient.getCurrentUser();
    if (provider === 'native') {
      if (currentUser.token) {
        localStorage.setItem('kubiq_token', currentUser.token);
        apiClient.setToken(currentUser.token);
      }
      handleNativeSuccess(currentUser);
    }
    return currentUser;
  };

  const registerNative = async (data: any) => {
      await apiClient.register(data);
      // Auto-login after register? Or redirect?
      // For now, let caller handle redirect to login
  };

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const logout = () => {
    setIsLoggingOut(true);
    
    const baseUrl = import.meta.env.BASE_URL.endsWith('/') 
        ? import.meta.env.BASE_URL 
        : import.meta.env.BASE_URL + '/';
    const loginUrl = `${window.location.origin}${baseUrl}login`;

    // Delay for animation
    setTimeout(() => {
        if (provider === 'keycloak' && keycloak) {
            keycloak.logout({
                redirectUri: loginUrl,
            });
        } else {
            // Native Logout
            localStorage.removeItem('kubiq_token');
            apiClient.clearToken();
            setIsAuthenticated(false);
            setUser(null);
            setRoles([]);
            setPermissions([]);
            setPermissionsLoaded(false);
            setProvider(null);
            // Reload to reset state fully or just redirect
            window.location.href = loginUrl; 
        }
    }, 1500);
  };

  const hasRole = (role: string) => roles.includes(role);
  const hasPermission = (permission: string) => permissions.includes('*') || permissions.includes(permission);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        authEnabled,
        nativeAuthEnabled,
        provider,
        user,
        roles,
        permissions,
        permissionsLoaded,
        loginKeycloak,
        loginNative,
        loginWithToken,
        registerNative,
        refreshCurrentUser,
        logout,
        keycloak,
        hasRole,
        hasPermission,
      }}
    >
      {children}

      {/* Premium Logout Modal */}
      {isLoggingOut && (
         <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
             <div className="bg-bg-surface border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl scale-100 animate-in zoom-in-95 duration-300 flex flex-col items-center">
                 <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-6 animate-bounce">
                     <LogOut className="w-8 h-8 text-primary" />
                 </div>
                 <h2 className="text-2xl font-bold bg-linear-to-r from-white to-white/60 bg-clip-text text-transparent mb-2">
                    Logging Out
                 </h2>
                 <p className="text-text-dim">
                    See you again soon! 👋
                 </p>
                 <div className="mt-8 w-full bg-white/5 rounded-full h-1 overflow-hidden">
                     <div className="h-full bg-primary animate-progress-indeterminate"></div>
                 </div>
             </div>
         </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
