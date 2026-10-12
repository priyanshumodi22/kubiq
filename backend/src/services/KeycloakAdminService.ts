import axios, { AxiosInstance } from 'axios';

type KeycloakAdminConfig = { url: string; realm: string; clientId: string; clientSecret: string; kubiqClientId: string };

/** Server-only Keycloak Admin REST client. The browser never receives these credentials. */
export class KeycloakAdminService {
  private static token: { value: string; expiresAt: number } | null = null;
  private readonly config: KeycloakAdminConfig;

  constructor() {
    this.config = {
      url: (process.env.KEYCLOAK_URL || '').replace(/\/$/, ''),
      realm: process.env.KEYCLOAK_REALM || 'kubiq',
      clientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID || '',
      clientSecret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '',
      kubiqClientId: process.env.KEYCLOAK_CLIENT_ID || 'kubiq',
    };
  }

  get configured(): boolean { return Boolean(this.config.url && this.config.clientId && this.config.clientSecret); }

  async health(): Promise<{ configured: boolean; reachable: boolean }> {
    if (!this.configured) return { configured: false, reachable: false };
    try { await this.client(); return { configured: true, reachable: true }; }
    catch { return { configured: true, reachable: false }; }
  }

  async listUsers(search?: string): Promise<any[]> {
    const client = await this.client();
    const response = await client.get(`/admin/realms/${encodeURIComponent(this.config.realm)}/users`, { params: { ...(search ? { search } : {}), max: 100 } });
    return Promise.all(response.data.map(async (user: any) => ({
      id: user.id, username: user.username, email: user.email, enabled: user.enabled,
      roles: await this.getUserClientRoles(user.id), type: 'keycloak',
    })));
  }

  async createUser(input: { username: string; email?: string; firstName?: string; lastName?: string; temporaryPassword: string; roles?: string[] }): Promise<string> {
    const client = await this.client();
    const base = `/admin/realms/${encodeURIComponent(this.config.realm)}`;
    const response = await client.post(`${base}/users`, { username: input.username, email: input.email, firstName: input.firstName, lastName: input.lastName, enabled: true });
    const id = String(response.headers.location || '').split('/').pop();
    if (!id) throw new Error('KEYCLOAK_USER_CREATE_FAILED');
    try {
      // Keycloak's temporary credential forces first-login replacement.
      await client.put(`${base}/users/${encodeURIComponent(id)}/reset-password`, { type: 'password', value: input.temporaryPassword, temporary: true });
      if (input.roles?.length) await this.replaceUserClientRoles(id, input.roles);
      return id;
    } catch (error) {
      // Do not leave a partially-provisioned account that an administrator cannot safely retry.
      try { await client.delete(`${base}/users/${encodeURIComponent(id)}`); } catch { /* reconciliation reports any survivor */ }
      throw error;
    }
  }

  async updateUser(id: string, input: { email?: string; firstName?: string; lastName?: string; enabled?: boolean }): Promise<void> {
    const client = await this.client();
    const base = `/admin/realms/${encodeURIComponent(this.config.realm)}/users/${encodeURIComponent(id)}`;
    const existing = (await client.get(base)).data;
    await client.put(base, { ...existing, ...input });
  }

  async deleteUser(id: string): Promise<void> { await (await this.client()).delete(`/admin/realms/${encodeURIComponent(this.config.realm)}/users/${encodeURIComponent(id)}`); }

  async resetPassword(id: string, temporaryPassword: string): Promise<void> {
    await (await this.client()).put(`/admin/realms/${encodeURIComponent(this.config.realm)}/users/${encodeURIComponent(id)}/reset-password`, { type: 'password', value: temporaryPassword, temporary: true });
  }

  async getClientRoles(): Promise<Array<{ id: string; name: string; description?: string }>> {
    const client = await this.client();
    const clientUuid = await this.clientUuid(client);
    return (await client.get(`/admin/realms/${encodeURIComponent(this.config.realm)}/clients/${encodeURIComponent(clientUuid)}/roles`)).data;
  }

  async createClientRole(name: string, description = ''): Promise<void> {
    const client = await this.client();
    const clientUuid = await this.clientUuid(client);
    await client.post(`/admin/realms/${encodeURIComponent(this.config.realm)}/clients/${encodeURIComponent(clientUuid)}/roles`, { name, description });
  }

  async updateClientRole(name: string, description: string): Promise<void> {
    const client = await this.client();
    const clientUuid = await this.clientUuid(client);
    await client.put(`/admin/realms/${encodeURIComponent(this.config.realm)}/clients/${encodeURIComponent(clientUuid)}/roles/${encodeURIComponent(name)}`, { name, description });
  }

  async deleteClientRole(name: string): Promise<void> {
    const client = await this.client();
    const clientUuid = await this.clientUuid(client);
    await client.delete(`/admin/realms/${encodeURIComponent(this.config.realm)}/clients/${encodeURIComponent(clientUuid)}/roles/${encodeURIComponent(name)}`);
  }

  async replaceUserClientRoles(userId: string, roleNames: string[]): Promise<void> {
    const client = await this.client();
    const clientUuid = await this.clientUuid(client);
    const endpoint = `/admin/realms/${encodeURIComponent(this.config.realm)}/users/${encodeURIComponent(userId)}/role-mappings/clients/${encodeURIComponent(clientUuid)}`;
    const [available, current] = await Promise.all([this.getClientRoles(), client.get(endpoint)]);
    const wanted = available.filter(role => roleNames.includes(role.name));
    if (wanted.length !== roleNames.length) throw new Error('KEYCLOAK_CLIENT_ROLE_NOT_FOUND');
    const currentByName = new Map(current.data.map((role: any) => [role.name, role]));
    const wantedNames = new Set(wanted.map(role => role.name));
    const remove = current.data.filter((role: any) => !wantedNames.has(role.name));
    const add = wanted.filter(role => !currentByName.has(role.name));
    if (remove.length) await client.delete(endpoint, { data: remove });
    if (add.length) await client.post(endpoint, add);
  }

  private async getUserClientRoles(userId: string): Promise<string[]> {
    const client = await this.client();
    const clientUuid = await this.clientUuid(client);
    const response = await client.get(`/admin/realms/${encodeURIComponent(this.config.realm)}/users/${encodeURIComponent(userId)}/role-mappings/clients/${encodeURIComponent(clientUuid)}`);
    return response.data.map((role: any) => role.name).filter(Boolean);
  }

  private async clientUuid(client: AxiosInstance): Promise<string> {
    const response = await client.get(`/admin/realms/${encodeURIComponent(this.config.realm)}/clients`, { params: { clientId: this.config.kubiqClientId } });
    const id = response.data?.[0]?.id;
    if (!id) throw new Error('KEYCLOAK_KUBIQ_CLIENT_NOT_FOUND');
    return id;
  }

  private async client(): Promise<AxiosInstance> {
    if (!this.configured) throw new Error('KEYCLOAK_ADMIN_NOT_CONFIGURED');
    const now = Date.now();
    if (!KeycloakAdminService.token || KeycloakAdminService.token.expiresAt <= now) {
      const issuer = `${this.config.url}/realms/${encodeURIComponent(this.config.realm)}`;
      const response = await axios.post(`${issuer}/protocol/openid-connect/token`, new URLSearchParams({ grant_type: 'client_credentials', client_id: this.config.clientId, client_secret: this.config.clientSecret }), { timeout: 5000 });
      KeycloakAdminService.token = { value: response.data.access_token, expiresAt: now + Math.max(30, Number(response.data.expires_in || 60) - 15) * 1000 };
    }
    return axios.create({ baseURL: this.config.url, timeout: 7000, headers: { Authorization: `Bearer ${KeycloakAdminService.token.value}` } });
  }
}
