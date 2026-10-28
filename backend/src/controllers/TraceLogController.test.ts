import { jest, expect, it, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';
import { traceLogs, traceLogWindow } from './TraceLogController';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { RbacRoleService } from '../services/RbacRoleService';
import type { ISpan } from '../database/interfaces/ITraceRepository';
jest.mock('../database/DatabaseFactory');
jest.mock('../services/RbacRoleService');
jest.mock('../middleware/auth', () => ({ canAccessKubernetesNamespace: async (_user: unknown, ns: string) => ns === 'apps' }));
const id = '1234567890abcdef1234567890abcdef';
const query = jest.fn<(...args: unknown[]) => Promise<unknown[]>>(), getServices = jest.fn<() => Promise<string[]>>(), getTraceDetails = jest.fn<() => Promise<object[]>>();
function res() { const value = { status: jest.fn(), json: jest.fn() }; value.status.mockReturnValue(value); return value as unknown as Response; }
function req(traceId = id, serviceName?: string) { return { params: { traceId }, query: { serviceName }, user: {} } as unknown as Request; }
beforeEach(() => {
    jest.resetAllMocks();
    (DatabaseFactory.isLogStorageSupported as jest.Mock<(...args: unknown[]) => unknown>).mockReturnValue(true);
    (DatabaseFactory.isApmSupported as jest.Mock<(...args: unknown[]) => unknown>).mockReturnValue(true);
    (DatabaseFactory.getLogRepository as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue({ getServices, queryLogs: query });
    (DatabaseFactory.getTraceRepository as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue({ getTraceDetails });
    (RbacRoleService.hasPermission as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue(true);
    getServices.mockResolvedValue(['kubiq-backend', 'k8s:apps:web', 'k8s:private:secret']); query.mockResolvedValue([{ message: 'actual event' }]);
    getTraceDetails.mockResolvedValue([{ startTimeUnixNano: 1700000000000000000, endTimeUnixNano: 1700000000001000000 }]);
});
it('searches only permitted names within the trace window and returns actual records', async () => {
    const response = res(); await traceLogs(req(), response);
    expect(query).toHaveBeenCalledWith('', expect.objectContaining({ serviceNames: ['kubiq-backend', 'k8s:apps:web'], traceId: id, limit: 500 }));
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ traceFound: true, sourceCount: 2, logs: [{ message: 'actual event' }] }));
});
it('requires Kubernetes read as well as namespace scope, and rejects denied filters', async () => {
    (RbacRoleService.hasPermission as jest.Mock<(...args: unknown[]) => Promise<unknown>>).mockResolvedValue(false); await traceLogs(req(), res()); expect((query.mock.calls[0][1] as { serviceNames: string[] }).serviceNames).toEqual(['kubiq-backend']);
    const response = res(); await traceLogs(req(id, 'k8s:private:secret'), response); expect(response.status).toHaveBeenCalledWith(403);
});
it('permits an authorized narrow source and truthfully handles missing traces and no sources', async () => {
    getTraceDetails.mockResolvedValue([]); const response = res(); await traceLogs(req(id, 'kubiq-backend'), response);
    expect((query.mock.calls[0][1] as { serviceNames: string[] }).serviceNames).toEqual(['kubiq-backend']); expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ traceFound: false }));
    getServices.mockResolvedValue([]); query.mockClear(); await traceLogs(req(), res()); expect(query).not.toHaveBeenCalled();
});
it.each(['invalid', '0000000000000000', '(a+)+'])('rejects invalid IDs %s', async traceId => { const response = res(); await traceLogs(req(traceId), response); expect(response.status).toHaveBeenCalledWith(400); expect(query).not.toHaveBeenCalled(); });
it('distinguishes unsupported storage, unavailable databases and invalid windows', async () => {
    (DatabaseFactory.isLogStorageSupported as jest.Mock<(...args: unknown[]) => unknown>).mockReturnValue(false); const unsupported = res(); await traceLogs(req(), unsupported); expect(unsupported.status).toHaveBeenCalledWith(409);
    (DatabaseFactory.isLogStorageSupported as jest.Mock<(...args: unknown[]) => unknown>).mockReturnValue(true); query.mockRejectedValueOnce(new Error('PRIVATE')); const unavailable = res(); await traceLogs(req(), unavailable); expect(unavailable.status).toHaveBeenCalledWith(503); expect(unavailable.json).toHaveBeenCalledWith({ message: 'Retained trace logs are unavailable. Please retry.' });
    getTraceDetails.mockResolvedValue([{ startTimeUnixNano: 1e9, endTimeUnixNano: 1e18 }]); const invalid = res(); await traceLogs(req(), invalid); expect(invalid.status).toHaveBeenCalledWith(400);
});
it('uses a bounded fallback and rejects inverted windows', () => {
    expect(traceLogWindow([], 7 * 86400000)).toEqual({ from: new Date(0), to: new Date(7 * 86400000) });
    expect(() => traceLogWindow([{ startTimeUnixNano: 1e10, endTimeUnixNano: 1e9 }] as ISpan[])).toThrow();
});

it('rejects non-string source filters without implicit object conversion', async () => {
    const request = req(); request.query.serviceName = { unsafe: 'value' };
    const response = res(); await traceLogs(request, response); expect(response.status).toHaveBeenCalledWith(400);
});
