import { createContext, useContext } from 'react';
import type Keycloak from 'keycloak-js';
import type { AuthProviderType, LoginCredentials, RegistrationInput, UserAccount, UserProfile } from '../types/auth';

export type { AuthProviderType } from '../types/auth';
export interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  authEnabled: boolean;
  nativeAuthEnabled: boolean;
  provider: AuthProviderType | null;
  user: UserProfile | null;
  roles: string[];
  permissions: string[];
  permissionsLoaded: boolean;
  loginKeycloak: () => void;
  loginNative: (credentials: LoginCredentials) => Promise<void>;
  loginWithToken: (token: string, user: UserAccount) => void;
  registerNative: (data: RegistrationInput) => Promise<void>;
  refreshCurrentUser: () => Promise<UserAccount | null>;
  logout: () => void;
  keycloak: Keycloak | null;
  hasRole: (role: string) => boolean;
  hasPermission: (permission: string) => boolean;
}
export const AuthContext = createContext<AuthContextType | undefined>(undefined);
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
