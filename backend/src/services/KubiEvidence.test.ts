import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const serviceMonitor = { getAllServices: jest.fn<any>() };
const logRepository = { queryLogs: jest.fn<any>() };
const traceRepository = { getServiceMetrics: jest.fn<any>(), getRecentTraces: jest.fn<any>(), getTraceDetails: jest.fn<any>(), getSpansForExport: jest.fn<any>() };
const auditRepository = { getAuditLogs: jest.fn<any>() };
const k8s = { kubiReaderAvailable: true, defaultContext: 'cluster', getNamespaces: jest.fn<any>(), getPods: jest.fn<any>(), getEvents: jest.fn<any>(), getDeployments: jest.fn<any>(), getPodLogs: jest.fn<any>() };
const notificationManager = { getHistory: jest.fn<any>() };

jest.mock('../database/DatabaseFactory', () => ({
  DatabaseFactory: {
    getLogRepository: jest.fn(async () => logRepository), getTraceRepository: jest.fn(async () => traceRepository),
    getAuditLogRepository: jest.fn(async () => auditRepository), getUserRepository: jest.fn(), isApmSupported: jest.fn(() => true),
  },
}));
jest.mock('./ServiceMonitor', () => ({ ServiceMonitor: { getInstance: () => serviceMonitor } }));
jest.mock('./SystemMonitorService', () => ({ SystemMonitorService: { getInstance: () => ({ getLiveStats: jest.fn() }) } }));
jest.mock('./KubernetesService', () => ({ KubernetesService: { getInstance: () => k8s } }));
jest.mock('./NotificationManager', () => ({ NotificationManager: { getInstance: () => notificationManager } }));

import { KubiService } from './KubiService';
import { KubiProviderService } from './KubiProviderService';
import { KubiDocsService } from './KubiDocsService';

describe('kubi read-only evidence collection', () => {
  it('routes user namespace changes to filtered audit records without querying Kubernetes', async () => {
    const provider = jest.spyOn(KubiProviderService.prototype, 'stream').mockResolvedValue('Audit result');
    auditRepository.getAuditLogs.mockResolvedValue([{ user: 'admin', action: 'AUTH_ROLE_CHANGE', target: 'user/viewer', details: 'Updated allowed namespaces to: apps' }]);
    try {
      const result = await new KubiService().stream('Who updated my kubiq roles and namespace?', [], { user: { role: 'kubiq-admin' }, username: 'viewer', k8sContext: '' }, () => {}, undefined, { kind: 'answer', question: 'My access history', domains: ['audit'], message: '', options: [], auditTarget: '@self', userAccessHistory: true });
      expect(auditRepository.getAuditLogs).toHaveBeenCalledWith(51, undefined, { action: 'AUTH_ROLE_CHANGE', target: 'user/viewer' });
      expect(k8s.getNamespaces).not.toHaveBeenCalled();
      expect(result.evidence).toEqual([{ type: 'audit', label: 'Administrator audit history', href: '/audit-logs' }]);
    } finally { provider.mockRestore(); }
  });
  it('never fetches audit records for viewers even if a plan requests their own history', async () => {
    const provider = jest.spyOn(KubiProviderService.prototype, 'stream').mockResolvedValue('Permission denied');
    try {
      await new KubiService().stream('My account history', [], { user: { role: 'kubiq-viewer' }, username: 'viewer', k8sContext: '' }, () => {}, undefined, { kind: 'answer', question: 'My account history', domains: ['audit'], message: '', options: [], auditTarget: '@self', userAccessHistory: true });
      expect(auditRepository.getAuditLogs).not.toHaveBeenCalled();
    } finally { provider.mockRestore(); }
  });
  it('answers docs questions without fetching telemetry or forwarding old private history', async () => {
    const docs = jest.spyOn(KubiDocsService, 'search').mockResolvedValue([{ title: 'Authentication', href: 'https://kubiq.priyanshumodi.in/docs/configuration#authentication', text: 'Native authentication is supported.' }]);
    const provider = jest.spyOn(KubiProviderService.prototype, 'stream').mockImplementation(async (messages, onDelta) => {
      expect(JSON.stringify(messages)).not.toContain('private old telemetry');
      onDelta('Native authentication is supported.');
      return 'Native authentication is supported.';
    });
    try {
      const result = await new KubiService().stream('How do I configure kubiq authentication?', [{ id: 'old', role: 'assistant', content: 'private old telemetry', createdAt: '' }], { user: {}, username: 'viewer', k8sContext: '' }, () => {});
      expect(serviceMonitor.getAllServices).not.toHaveBeenCalled();
      expect(result.evidence[0].type).toBe('documentation');
    } finally { docs.mockRestore(); provider.mockRestore(); }
  });
  it('does not ask the provider to guess when documentation is unavailable', async () => {
    const docs = jest.spyOn(KubiDocsService, 'search').mockResolvedValue([]);
    const provider = jest.spyOn(KubiProviderService.prototype, 'stream');
    try {
      const result = await new KubiService().stream('How do I configure kubiq authentication?', [], { user: {}, username: 'viewer', k8sContext: '' }, () => {});
      expect(provider).not.toHaveBeenCalled();
      expect(result.answer).toContain('won’t guess');
      expect(result.evidence).toEqual([]);
    } finally { docs.mockRestore(); provider.mockRestore(); }
  });
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AI_KUBI_MAX_TOOL_CALLS = '6';
    process.env.AI_KUBI_MAX_RESULTS_PER_TOOL = '50';
    serviceMonitor.getAllServices.mockReturnValue([{ name: 'api', type: 'http', currentStatus: 'unhealthy', history: [] }]);
    logRepository.queryLogs.mockResolvedValue([{ level: 'ERROR', message: 'timeout' }]);
    traceRepository.getServiceMetrics.mockResolvedValue([{ serviceName: 'api', requestCount: 2, errorCount: 1, avgDurationMs: 300, p95DurationMs: 500 }]);
    traceRepository.getRecentTraces.mockResolvedValue([{ traceId: 'abc', name: 'GET /', startTimeUnixNano: 1, durationMs: 500, statusCode: 2 }]);
    traceRepository.getTraceDetails.mockResolvedValue([]);
    traceRepository.getSpansForExport.mockResolvedValue([{ name: 'db.query', durationMs: 900, attributes: { 'db.statement': 'select secret' } }]);
    auditRepository.getAuditLogs.mockResolvedValue([{ id: 'audit-1', timestamp: '2026-01-01T00:00:00Z', user: 'admin', action: 'SERVICE_CREATE', target: 'service/api', ip: '127.0.0.1' }]);
    notificationManager.getHistory.mockReturnValue([{ id: 'notice-1', title: 'api down', delivered: true }]);
    k8s.getNamespaces.mockResolvedValue(['apps']);
    k8s.getPods.mockResolvedValue([{ name: 'api-123', containers: [{ name: 'api' }] }]);
    k8s.getEvents.mockResolvedValue([]);
    k8s.getDeployments.mockResolvedValue([]);
    k8s.getPodLogs.mockResolvedValue('pod log tail');
  });

  it('reports real collection and generation stages before answer deltas', async () => {
    const events: string[] = [];
    const provider = jest.spyOn(KubiProviderService.prototype, 'stream').mockImplementation(async (_messages, onDelta) => {
      expect(events).toEqual(['searching', 'working']);
      onDelta('Healthy');
      onDelta(' services');
      return 'Healthy services';
    });
    try {
      await new KubiService().stream('service health', [], { user: {}, username: 'viewer', k8sContext: 'cluster' },
        text => events.push(text), state => events.push(state));
      expect(events).toEqual(['searching', 'working', 'composing', 'Healthy', ' services']);
    } finally { provider.mockRestore(); }
  });

  it('collects bounded service, log, and slow-database evidence without exposing SQL to non-admins', async () => {
    const evidence = await (new KubiService() as any).collectEvidence('Show logs and slow database queries for api', { user: { role: 'kubiq-viewer' }, username: 'viewer', k8sContext: 'cluster' });
    const tracePayload = evidence.find((item: any) => item.reference.type === 'trace').payload;

    expect(evidence.map((item: any) => item.reference.type)).toEqual(expect.arrayContaining(['service', 'logs', 'trace']));
    expect(tracePayload.slowDatabaseSpans[0].attributes['db.statement']).toBeUndefined();
    expect(logRepository.queryLogs).toHaveBeenCalledWith('api', expect.objectContaining({ limit: 50 }));
  });

  it('exposes notification history and redacted administrator audit history only to admins', async () => {
    const evidence = await (new KubiService() as any).collectEvidence('Show notification alert delivery and audit activity history', { user: { role: 'kubiq-admin' }, username: 'admin', k8sContext: 'cluster' });
    const auditPayload = evidence.find((item: any) => item.reference.type === 'audit').payload;

    expect(evidence.map((item: any) => item.reference.type)).toEqual(expect.arrayContaining(['notification-history', 'audit']));
    expect(auditPayload.records[0].ip).toBeUndefined();
  });

  it('uses only the isolated reader identity for Kubernetes inventory and pod logs', async () => {
    const evidence = await (new KubiService() as any).collectEvidence('Investigate Kubernetes pod api-123 logs in apps', { user: { role: 'kubiq-viewer' }, username: 'viewer', k8sContext: 'cluster' });

    expect(evidence.map((item: any) => item.reference.type)).toContain('kubernetes');
    expect(k8s.getPods).toHaveBeenCalledWith('cluster', 'apps', true);
    expect(k8s.getPodLogs).toHaveBeenCalledWith('cluster', 'apps', 'api-123', 'api', 50, true);
  });

  it('honors the configured maximum number of read-only tool calls', async () => {
    process.env.AI_KUBI_MAX_TOOL_CALLS = '1';
    const evidence = await (new KubiService() as any).collectEvidence('Show service logs, slow database queries, Kubernetes pod logs, notification alert history, and audit activity history for api', { user: { role: 'kubiq-admin' }, username: 'admin', k8sContext: 'cluster' });

    expect(evidence).toHaveLength(1);
    expect(evidence[0].reference.type).toBe('service');
  });
});
