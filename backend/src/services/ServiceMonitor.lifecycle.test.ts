import axios from 'axios';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { DatabaseFactory } from '../database/DatabaseFactory';
import type { IServiceRepository } from '../database/interfaces/IServiceRepository';
import type { ServiceStatus } from '../types';
import { ServiceMonitor } from './ServiceMonitor';
import type { KubePod } from './KubernetesService';

const notify = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
const customAlert = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
const cluster = {
  available: false, defaultContext: 'fixture',
  getNamespaces: jest.fn<() => Promise<string[]>>(),
  getPods: jest.fn<() => Promise<KubePod[]>>(),
  getNodes: jest.fn<() => Promise<{ name: string; cpuPercent: string; memoryPercent: string }[]>>(),
};
jest.mock('./NotificationManager', () => ({ NotificationManager: { getInstance: () => ({ notifyStatusChange: notify, notifyCustomAlert: customAlert }) } }));
jest.mock('./KubernetesService', () => ({ KubernetesService: { getInstance: () => cluster } }));

const repository: IServiceRepository = {
  initialize: async () => {}, getAllServices: jest.fn<IServiceRepository['getAllServices']>(),
  getServiceByName: async () => null, addService: jest.fn<IServiceRepository['addService']>(),
  updateService: jest.fn<IServiceRepository['updateService']>(), deleteService: async () => {},
  saveCheckResult: jest.fn<IServiceRepository['saveCheckResult']>().mockResolvedValue(undefined),
  getServiceHistory: async () => [], getSystemConfig: async () => ({ slug: null, dashboardTitle: 'Fixture', refreshInterval: 300 }),
  saveSystemConfig: async () => {}, close: async () => {},
};
let monitor: ServiceMonitor;
let service: ServiceStatus;
const previousLimit = process.env.MAX_CONCURRENT_CHECKS;
beforeAll(() => { process.env.MAX_CONCURRENT_CHECKS = '1'; monitor = ServiceMonitor.getInstance(); });
beforeEach(async () => {
  service = { name: 'fixture', endpoint: 'https://example.test/health', type: 'http', currentStatus: 'unknown', history: [], interval: 1000, retries: 3 };
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(DatabaseFactory, 'getServiceRepository').mockResolvedValue(repository);
  jest.mocked(repository.getAllServices).mockResolvedValue([service]);
  jest.mocked(repository.saveCheckResult).mockResolvedValue(undefined);
  notify.mockClear();
  customAlert.mockClear();
  cluster.available = false;
  cluster.getNamespaces.mockReset().mockResolvedValue(['apps']);
  cluster.getPods.mockReset().mockResolvedValue([]);
  cluster.getNodes.mockReset().mockResolvedValue([]);
  await monitor.initialize();
});

describe('Kubernetes background alert characterization', () => {
  const pod = (status: string, restarts = 0): KubePod => ({ name: 'pod-fixture', namespace: 'apps', status, restarts, ready: status === 'Running', podIP: '', nodeName: 'node-fixture', startTime: null, labels: {}, containers: [], conditions: [] });

  test('does not query an unavailable cluster', async () => {
    await monitor.checkK8sClusterAlerts();
    expect(cluster.getNamespaces).not.toHaveBeenCalled();
  });
  test('deduplicates failure alerts and does not mistake completed jobs for recovery', async () => {
    cluster.available = true;
    cluster.getPods.mockResolvedValue([pod('CrashLoopBackOff', 1)]);
    await monitor.checkK8sClusterAlerts();
    await monitor.checkK8sClusterAlerts();
    expect(customAlert).toHaveBeenCalledTimes(1);
    cluster.getPods.mockResolvedValue([pod('Completed', 1)]);
    await monitor.checkK8sClusterAlerts();
    cluster.getPods.mockResolvedValue([pod('Running', 1)]);
    await monitor.checkK8sClusterAlerts();
    expect(notify).not.toHaveBeenCalled();
    cluster.getPods.mockResolvedValue([pod('Running', 2)]);
    await monitor.checkK8sClusterAlerts();
    expect(customAlert).toHaveBeenCalledTimes(2);
    await monitor.checkK8sClusterAlerts();
    expect(notify).toHaveBeenCalledWith('apps/pod-fixture', 'healthy', undefined, expect.any(Object));
  });
  test('uses a strict resource threshold and suppresses repeated node alerts', async () => {
    cluster.available = true;
    cluster.getNodes.mockResolvedValue([{ name: 'node-fixture', cpuPercent: '85', memoryPercent: '85' }]);
    await monitor.checkK8sClusterAlerts();
    expect(customAlert).not.toHaveBeenCalled();
    cluster.getNodes.mockResolvedValue([{ name: 'node-fixture', cpuPercent: '86', memoryPercent: '85' }]);
    await monitor.checkK8sClusterAlerts();
    await monitor.checkK8sClusterAlerts();
    expect(customAlert).toHaveBeenCalledTimes(1);
  });
  test('contains a failed cluster poll so the next poll can recover', async () => {
    cluster.available = true;
    cluster.getPods.mockRejectedValueOnce(new Error('cluster offline'));
    await expect(monitor.checkK8sClusterAlerts()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('retrying on the next poll'), expect.any(Error));
    await expect(monitor.checkK8sClusterAlerts()).resolves.toBeUndefined();
  });
});
afterEach(() => { monitor.stop(); jest.useRealTimers(); jest.restoreAllMocks(); });
afterAll(() => { if (previousLimit === undefined) delete process.env.MAX_CONCURRENT_CHECKS; else process.env.MAX_CONCURRENT_CHECKS = previousLimit; });

describe('monitor result, retry and cancellation contracts', () => {
  test('keeps retries, recovery notifications and history ordering', async () => {
    const request = jest.spyOn(axios, 'get').mockResolvedValue({ status: 503 });
    await monitor.checkServiceHealth(service.name);
    await monitor.checkServiceHealth(service.name);
    expect(service.currentStatus).toBe('unknown');
    await monitor.checkServiceHealth(service.name);
    expect(service.currentStatus).toBe('unhealthy');
    expect(notify).not.toHaveBeenCalled();
    request.mockResolvedValue({ status: 200, request: { res: { socket: { getPeerCertificate: () => ({ valid_to: 'Jan 1 2030 GMT' }) } } } });
    const recovered = await monitor.checkServiceHealth(service.name);
    expect(service.currentStatus).toBe('healthy');
    expect(service.history.map(check => check.status)).toEqual([503, 503, 503, 200]);
    expect(service.lastCheck).toBe(recovered);
    expect(notify).toHaveBeenCalledWith(service.name, 'healthy', undefined, expect.objectContaining({ statusCode: 200 }));
    expect(service.sslExpiry).toEqual(new Date('Jan 1 2030 GMT'));
  });

  test.each([false, true])('preserves explicit TLS verification setting ignoreSSL=%s', async ignoreSSL => {
    service.ignoreSSL = ignoreSSL;
    const request = jest.spyOn(axios, 'get').mockResolvedValue({ status: 503 });
    await monitor.checkServiceHealth(service.name);
    expect(request).toHaveBeenCalledWith(service.endpoint, expect.objectContaining({ maxRedirects: 0, httpsAgent: expect.objectContaining({ options: expect.objectContaining({ rejectUnauthorized: !ignoreSSL }) }) }));
  });

  test('records failed checks and continues after persistence failure', async () => {
    jest.spyOn(axios, 'get').mockRejectedValue(new Error('network offline'));
    jest.mocked(repository.saveCheckResult).mockRejectedValue(new Error('database offline'));
    const check = await monitor.checkServiceHealth(service.name);
    expect(check).toEqual(expect.objectContaining({ success: false, status: 0, error: 'network offline' }));
    expect(service.history).toContain(check);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to persist'), expect.any(Error));
  });

  test('releases the concurrency slot after a missing service', async () => {
    await expect(monitor.checkServiceHealth('missing')).rejects.toThrow('not found');
    jest.spyOn(axios, 'get').mockResolvedValue({ status: 503 });
    await expect(monitor.checkServiceHealth(service.name)).resolves.toMatchObject({ status: 503 });
  });

  test('serializes checks at the configured concurrency bound', async () => {
    const resolve: ((value: { status: number }) => void)[] = [];
    const request = jest.spyOn(axios, 'get').mockImplementation(() => new Promise(done => { resolve.push(done); }));
    const first = monitor.checkServiceHealth(service.name);
    const second = monitor.checkServiceHealth(service.name);
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    resolve[0]({ status: 503 });
    await first;
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
    resolve[1]({ status: 503 });
    await second;
  });

  test('does not execute a delayed startup check after monitoring stops', async () => {
    jest.useFakeTimers();
    const request = jest.spyOn(axios, 'get').mockResolvedValue({ status: 503 });
    monitor.start();
    monitor.stop();
    await jest.advanceTimersByTimeAsync(500);
    expect(request).not.toHaveBeenCalled();
  });

  test('settles queued checks on stop while allowing an in-flight result to finish', async () => {
    jest.useFakeTimers();
    let finish: ((value: { status: number }) => void) | undefined;
    jest.spyOn(axios, 'get').mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    monitor.start();
    const active = monitor.checkServiceHealth(service.name);
    let cancelled = false;
    const queued = monitor.checkServiceHealth(service.name).catch(() => { cancelled = true; });
    await Promise.resolve();
    monitor.stop();
    await Promise.resolve();
    finish?.({ status: 503 });
    await active;
    expect(cancelled).toBe(true);
    await queued;
  });
});

test('shutdown may defer the shared repository close until final ingestion has drained', async () => {
  const close = jest.spyOn(repository, 'close');
  monitor.start();
  monitor.stop(false);
  expect(close).not.toHaveBeenCalled();
  await monitor.closeRepository();
  expect(close).toHaveBeenCalledTimes(1);
});
