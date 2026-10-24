// @vitest-environment jsdom
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';

let apiClient: typeof import('./api').apiClient;
let requests: InternalAxiosRequestConfig[];

beforeEach(async () => {
  vi.resetModules();
  requests = [];
  const adapter: AxiosAdapter = async config => {
    requests.push(config);
    return { data: { updated: true }, status: 200, statusText: 'OK', headers: {}, config };
  };
  axios.defaults.adapter = adapter;
  ({ apiClient } = await import('./api'));
});
afterEach(() => { vi.restoreAllMocks(); delete axios.defaults.adapter; });

describe('service update wire compatibility', () => {
  it('preserves explicit false and zero settings without clearing omitted logs', async () => {
    await expect(apiClient.updateService('fixture', { endpoint: 'https://example.test', type: 'http', ignoreSSL: false, interval: 0, retries: 0 })).resolves.toEqual({ updated: true });
    expect(requests[0].url).toBe('/api/services/fixture');
    expect(requests[0].method).toBe('put');
    expect(JSON.parse(requests[0].data)).toEqual({ endpoint: 'https://example.test', type: 'http', ignoreSSL: false, interval: 0, retries: 0 });
  });

  it('clears log settings only when explicitly requested', async () => {
    await apiClient.updateService('fixture', { endpoint: 'localhost:3306', type: 'mysql', logPath: '', logSources: [] });
    expect(JSON.parse(requests[0].data)).toEqual({ endpoint: 'localhost:3306', type: 'mysql', logPath: '', logSources: [] });
  });

  it('preserves configured log sources and machine authentication context', async () => {
    apiClient.setToken('fixture-token');
    apiClient.setKubernetesContext('fixture-context');
    const logSources = [{ id: 'persisted-id', name: 'Server', path: '/var/log/app.log', fileLimit: 5 }];
    await apiClient.updateService('fixture', { endpoint: 'https://example.test', logSources });
    expect(JSON.parse(requests[0].data).logSources).toEqual(logSources);
    expect(requests[0].headers.get('Authorization')).toBe('Bearer fixture-token');
    expect(requests[0].headers.get('x-kubernetes-context')).toBe('fixture-context');
  });

  it('emits the kubiq permission toast and propagates a denied update', async () => {
    const toast = vi.fn();
    window.addEventListener('kubiq:toast', toast);
    try {
      const rejected = new AxiosError('Forbidden', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 403, statusText: 'Forbidden', headers: {}, config: { headers: new AxiosHeaders() }, data: { error: 'RBAC_FORBIDDEN' },
      });
      axios.defaults.adapter = async () => { throw rejected; };
      vi.resetModules();
      ({ apiClient } = await import('./api'));
      await expect(apiClient.updateService('fixture', { endpoint: 'https://example.test' })).rejects.toBe(rejected);
      expect(toast).toHaveBeenCalledTimes(1);
      expect((toast.mock.calls[0][0] as CustomEvent).detail).toEqual({ type: 'warning', message: 'You do not have permission to perform this action.' });
    } finally {
      window.removeEventListener('kubiq:toast', toast);
    }
  });
});

describe('typed API payload compatibility', () => {
  it('preserves WebAuthn registration and login payloads without transforming credential fields', async () => {
    const credential = { id: 'fixture-credential', rawId: 'fixture-raw', type: 'public-key', response: { authenticatorData: 'fixture-data' } };
    await apiClient.registerPasskeyVerify(credential);
    await apiClient.loginPasskeyVerify('fixture-user', credential);
    expect(requests.map(request => [request.method, request.url, JSON.parse(request.data)])).toEqual([
      ['post', '/api/auth/webauthn/register/verify', credential],
      ['post', '/api/auth/webauthn/login/verify', { username: 'fixture-user', ...credential }],
    ]);
  });

  it('retains password and notification update fields at the transport boundary', async () => {
    const password = { currentPassword: 'fixture-old', newPassword: 'fixture-new' };
    const channel = { name: 'Fixture', type: 'webhook', enabled: false, config: { url: 'https://example.test', retries: 0 } };
    await apiClient.changePassword(password);
    await apiClient.createNotificationChannel(channel);
    await apiClient.updateNotificationChannel('fixture-channel', channel);
    expect(requests.map(request => [request.method, request.url, JSON.parse(request.data)])).toEqual([
      ['put', '/api/auth/change-password', password],
      ['post', '/api/notifications', channel],
      ['put', '/api/notifications/fixture-channel', channel],
    ]);
  });

  it('preserves diagnostic events, structured logs and the extended summary timeout', async () => {
    const event = { type: 'Warning', count: 0, message: 'Fixture event' };
    const logs = [{ message: 'Fixture log', attributes: { nested: true } }];
    await apiClient.aiDiagnoseEvent('fixture-namespace', event);
    await apiClient.summarizeLogs(logs, 'fixture-service');
    expect(requests.map(request => [request.url, JSON.parse(request.data)])).toEqual([
      ['/api/kubernetes/namespaces/fixture-namespace/events/ai-diagnose', { event }],
      ['/api/logs/summarize', { logs, serviceName: 'fixture-service' }],
    ]);
    expect(requests[1].timeout).toBe(60000);
  });
});
