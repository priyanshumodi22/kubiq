import React, { createContext, useContext, useState, useEffect } from 'react';
import Keycloak from 'keycloak-js';
import { apiClient } from '../services/api';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  authEnabled: boolean;
  user: any | null;
  roles: string[];
  login: () => void;
  logout: () => void;
  keycloak: Keycloak | null;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Global state - survives component remounts
let globalKeycloak: Keycloak | null = null;
let globalAuthEnabled = false;
let globalUser: any | null = null;
let globalRoles: string[] = [];
let globalIsAuthenticated = false;
let initPromise: Promise<void> | null = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(globalIsAuthenticated);
  const [isLoading, setIsLoading] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(globalAuthEnabled);
  const [user, setUser] = useState<any | null>(globalUser);
  const [roles, setRoles] = useState<string[]>(globalRoles);
  const [keycloak, setKeycloak] = useState<Keycloak | null>(globalKeycloak);

  useEffect(() => {
    const initAuth = async () => {
      // If already initialized, sync state and return immediately
      if (globalKeycloak !== null) {
        setKeycloak(globalKeycloak);
        setIsAuthenticated(globalIsAuthenticated);
        setAuthEnabled(globalAuthEnabled);
        setUser(globalUser);
        setRoles(globalRoles);
        setIsLoading(false);
        return;
      }

      // If currently initializing, wait for it
      if (initPromise !== null) {
        await initPromise;
        setKeycloak(globalKeycloak);
        setIsAuthenticated(globalIsAuthenticated);
        setAuthEnabled(globalAuthEnabled);
        setUser(globalUser);
        setRoles(globalRoles);
        setIsLoading(false);
        return;
      }

      // Create initialization promise
      initPromise = (async () => {
        try {
          // Fetch auth config from backend
          const config = await apiClient.getAuthConfig();
          globalAuthEnabled = config.enabled;
          setAuthEnabled(config.enabled);

          if (!config.enabled) {
            setIsLoading(false);
            return;
          }

          // Initialize Keycloak
          const kc = new Keycloak({
            url: config.url,
            realm: config.realm,
            clientId: config.clientId,
          });

          const authenticated = await kc.init({
            onLoad: 'check-sso',
            silentCheckSsoRedirectUri: `${window.location.origin}${
              import.meta.env.BASE_URL.endsWith('/')
                ? import.meta.env.BASE_URL
                : import.meta.env.BASE_URL + '/'
            }silent-check-sso.html`,
            pkceMethod: 'S256',
            checkLoginIframe: false,
          });

          globalKeycloak = kc;
          globalIsAuthenticated = authenticated;
          setKeycloak(kc);
          setIsAuthenticated(authenticated);

          if (authenticated && kc.token) {
            apiClient.setToken(kc.token);

            const tokenParsed = kc.tokenParsed as any;

            globalUser = {
              id: tokenParsed?.sub,
              username: tokenParsed?.preferred_username,
              email: tokenParsed?.email,
              firstName: tokenParsed?.given_name,
              lastName: tokenParsed?.family_name,
              name: tokenParsed?.name,
            };
            setUser(globalUser);

            const extractedRoles: string[] = [];

            if (tokenParsed?.realm_access?.roles) {
              extractedRoles.push(...tokenParsed.realm_access.roles);
            }

            const clientId = config.clientId;
            if (tokenParsed?.resource_access?.[clientId]?.roles) {
              extractedRoles.push(...tokenParsed.resource_access[clientId].roles);
            }

            globalRoles = [...new Set(extractedRoles)];
            setRoles(globalRoles);

            // Setup token refresh
            setInterval(() => {
              kc.updateToken(70)
                .then((refreshed) => {
                  if (refreshed && kc.token) {
                    apiClient.setToken(kc.token);
                  }
                })
                .catch(() => {
                  console.error('Failed to refresh token');
                });
            }, 60000);
          }
        } catch (error) {
          console.error('Auth initialization error:', error);
        } finally {
          setIsLoading(false);
        }
      })();

      await initPromise;
    };

    initAuth();
  }, []);

  const login = () => {
    if (keycloak) {
      keycloak.login();
    }
  };

  const logout = () => {
    if (keycloak) {
      // Always use window.location.origin for universal deployment
      keycloak.logout({
        redirectUri: window.location.origin,
      });
    }
  };

  const hasRole = (role: string): boolean => {
    return roles.includes(role);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        authEnabled,
        user,
        roles,
        login,
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
