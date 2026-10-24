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
