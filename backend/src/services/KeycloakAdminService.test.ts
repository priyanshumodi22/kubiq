import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const post = jest.fn<any>();
const create = jest.fn<any>();
jest.mock('axios', () => ({ __esModule: true, default: { post, create } }));

import { KeycloakAdminService } from './KeycloakAdminService';

describe('KeycloakAdminService configuration boundary', () => {
  const original = { url: process.env.KEYCLOAK_URL, id: process.env.KEYCLOAK_ADMIN_CLIENT_ID, secret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET };
  beforeEach(() => { post.mockReset(); create.mockReset(); });
  afterEach(() => {
    if (original.url === undefined) delete process.env.KEYCLOAK_URL; else process.env.KEYCLOAK_URL = original.url;
    if (original.id === undefined) delete process.env.KEYCLOAK_ADMIN_CLIENT_ID; else process.env.KEYCLOAK_ADMIN_CLIENT_ID = original.id;
    if (original.secret === undefined) delete process.env.KEYCLOAK_ADMIN_CLIENT_SECRET; else process.env.KEYCLOAK_ADMIN_CLIENT_SECRET = original.secret;
  });

  it('does not attempt a browser-visible or unauthenticated admin call when its service account is absent', async () => {
    delete process.env.KEYCLOAK_URL; delete process.env.KEYCLOAK_ADMIN_CLIENT_ID; delete process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
    const service = new KeycloakAdminService();
    await expect(service.health()).resolves.toEqual({ configured: false, reachable: false });
    expect(post).not.toHaveBeenCalled();
  });

  it('uses client credentials server-side before creating an authenticated admin client', async () => {
    process.env.KEYCLOAK_URL = 'https://keycloak.example'; process.env.KEYCLOAK_ADMIN_CLIENT_ID = 'kubiq-admin-api'; process.env.KEYCLOAK_ADMIN_CLIENT_SECRET = 'not-a-real-secret';
    post.mockResolvedValue({ data: { access_token: 'token', expires_in: 60 } });
    create.mockReturnValue({ get: jest.fn() });
    await expect(new KeycloakAdminService().health()).resolves.toEqual({ configured: true, reachable: true });
    expect(post).toHaveBeenCalledWith('https://keycloak.example/realms/kubiq/protocol/openid-connect/token', expect.any(URLSearchParams), expect.objectContaining({ timeout: 5000 }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ baseURL: 'https://keycloak.example' }));
  });
});
