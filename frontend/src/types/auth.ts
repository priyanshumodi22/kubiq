export type AuthProviderType = 'keycloak' | 'native';
export interface UserProfile {
  id?: string;
  username?: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  firstName?: string;
  lastName?: string;
}
export interface UserAccount extends UserProfile {
  id: string;
  username: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
  allowedNamespaces?: string[];
  token?: string;
}
export interface LoginCredentials { username: string; password: string }
export interface RegistrationInput extends LoginCredentials { email?: string }
export interface AuthConfig {
  provider: AuthProviderType | null;
  url: string;
  realm: string;
  clientId: string;
}
export interface NativeSession { token: string; user: UserAccount }
