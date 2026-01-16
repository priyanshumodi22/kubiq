import React, { createContext, useContext, useState, useEffect } from 'react';
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
  
  // Actions
  loginKeycloak: () => void;
  loginNative: (credentials: any) => Promise<void>;
  loginWithToken: (token: string, user: any) => void;
  registerNative: (data: any) => Promise<void>;
  logout: () => void;
  
  // Helpers
  keycloak: Keycloak | null;
  hasRole: (role: string) => boolean;
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
  const [keycloak, setKeycloak] = useState<Keycloak | null>(null);

  useEffect(() => {
    initAuth();
  }, []);

  const initAuth = async () => {
    try {
      // 1. Get Config
      const config = await apiClient.getAuthConfig();
      setAuthEnabled(config.enabled);
      setNativeAuthEnabled(config.nativeEnabled !== false); // Default true if undefined

      // 2. Try Keycloak (if enabled)
      let kcAuthenticated = false;
      if (config.enabled) {
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
      if (!kcAuthenticated && (config.nativeEnabled !== false)) {
          const storedToken = localStorage.getItem('kubiq_token');
          if (storedToken) {
              apiClient.setToken(storedToken);
              try {
                  const currentUser = await apiClient.getCurrentUser();
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
       if (tokenParsed?.realm_access?.roles) r.push(...tokenParsed.realm_access.roles);
       const clientId = kc.clientId;
       if (clientId && tokenParsed?.resource_access?.[clientId]?.roles) {
           r.push(...tokenParsed.resource_access[clientId].roles);
       }
       setRoles([...new Set(r)]);
       
       // Periodically refresh token
       setInterval(() => {
           kc.updateToken(70).then(refreshed => {
               if (refreshed) apiClient.setToken(kc.token!);
           });
       }, 60000);
  };

  const handleNativeSuccess = (userData: any) => {
      setIsAuthenticated(true);
      setProvider('native');
      setUser({
          username: userData.username,
          email: userData.email,
          name: userData.name
      });
      const r: string[] = [];
      if (userData.role) r.push(userData.role);
      if (userData.roles && Array.isArray(userData.roles)) r.push(...userData.roles);
      setRoles(r);
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

  const registerNative = async (data: any) => {
      await apiClient.register(data);
      // Auto-login after register? Or redirect?
      // For now, let caller handle redirect to login
  };

  const logout = () => {
    if (provider === 'keycloak' && keycloak) {
        keycloak.logout({
            redirectUri: `${window.location.origin}${import.meta.env.BASE_URL}`,
        });
    } else {
        // Native Logout
        localStorage.removeItem('kubiq_token');
        apiClient.clearToken();
        setIsAuthenticated(false);
        setUser(null);
        setRoles([]);
        setProvider(null);
        // Reload to reset state fully or just redirect
        window.location.href = '/'; 
    }
  };

  const hasRole = (role: string) => roles.includes(role);

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
        loginKeycloak,
        loginNative,
        loginWithToken,
        registerNative,
        logout,
        keycloak,
        hasRole,
      }}
    >
      {children}
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
