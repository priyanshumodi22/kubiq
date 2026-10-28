import { expect, it, jest } from '@jest/globals';
import * as k8s from '@kubernetes/client-node';
import { listWorkloads, readWorkload, workloadSummary, workloadConfig } from './KubernetesWorkloads';
jest.mock('@kubernetes/client-node', () => ({ CoreV1Api: class {}, AppsV1Api: class {}, BatchV1Api: class {}, KubeConfig: class { options: unknown; loadFromOptions(options: unknown) { this.options = options; } } }));
it.each(['StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob', 'ReplicationController'])('lists and reads %s from its correct API', async kind => {
    const type = kind.toLowerCase() + 's';
    const fixture = { kind, metadata: { name: 'fixture', namespace: 'apps' }, spec: { replicas: 2, schedule: '* * * * *', suspend: true }, status: { readyReplicas: 1 } };
    const list = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ items: [fixture] });
    const read = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(fixture);
    const api = { ['listNamespaced' + kind]: list, ['readNamespaced' + kind]: read };
    const config = { makeApiClient: () => api } as unknown as k8s.KubeConfig;
    expect(await listWorkloads(config, 'apps', type)).toEqual([expect.objectContaining({ name: 'fixture', workloadType: type })]);
    expect(await readWorkload(config, 'apps', type, 'fixture')).toBe(fixture);
    expect(read).toHaveBeenCalledWith({ namespace: 'apps', name: 'fixture' });
    list.mockRejectedValue(new Error('denied'));
    await expect(listWorkloads(config, 'apps', type)).rejects.toThrow('denied');
});
it('rejects unknown resource types and pins the requested context without mutating another context', async () => {
    const base = { clusters: [], users: [], contexts: [], getCurrentContext: () => 'original' } as unknown as k8s.KubeConfig;
    expect(Reflect.get(workloadConfig(base, 'requested'), 'options')).toEqual({ clusters: [], users: [], contexts: [], currentContext: 'requested' });
    expect(Reflect.get(workloadConfig(base, ''), 'options').currentContext).toBe('original');
    const config = { makeApiClient: () => ({}) } as unknown as k8s.KubeConfig;
    await expect(listWorkloads(config, 'apps', '__proto__')).rejects.toThrow('Unsupported');
    await expect(readWorkload(config, 'apps', 'secrets', 'fixture')).rejects.toThrow('Unsupported');
});
it('reports real workload readiness, Job conditions and CronJob scheduling without exposing container environment', () => {
    expect(workloadSummary('daemonsets', { status: { numberReady: 2, desiredNumberScheduled: 3 } })).toEqual(expect.objectContaining({ readyReplicas: 2, desired: 3 }));
    expect(workloadSummary('jobs', { spec: { completions: 2 }, status: { succeeded: 1, failed: 3, active: 1, conditions: [{ type: 'Failed', status: 'True' }] } })).toEqual(expect.objectContaining({ completions: 2, succeeded: 1, failed: 3, active: 1, failedCondition: true, completed: false }));
    expect(workloadSummary('jobs', { status: { conditions: [{ type: 'Complete', status: 'True' }] } }).completed).toBe(true);
    const item = workloadSummary('cronjobs', { spec: { schedule: '0 * * * *', suspend: true, jobTemplate: { spec: { template: { spec: { containers: [{ name: 'worker', image: 'fixture', env: [{ name: 'PASSWORD', value: 'synthetic' }] }] } } } } }, status: { active: [{ name: 'job' }], lastScheduleTime: '2026-10-28' } });
    expect(item).toEqual(expect.objectContaining({ schedule: '0 * * * *', suspended: true, active: 1 }));
    expect(JSON.stringify(item)).not.toContain('synthetic'); expect(workloadSummary('statefulsets', {}).containers).toEqual([]);
});
