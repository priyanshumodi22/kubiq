import { jest, expect, it, afterEach } from '@jest/globals';
import * as k8s from '@kubernetes/client-node';
import { KubernetesLogSources, parseLogSource, resolveLogPods, selectorText } from './KubernetesLogSources';
import { DatabaseFactory } from '../database/DatabaseFactory';
import { KubernetesService } from './KubernetesService';
jest.mock('../database/DatabaseFactory', () => ({ DatabaseFactory: { getSystemRepository: jest.fn() } }));
jest.mock('./KubernetesService', () => ({ KubernetesService: { getInstance: jest.fn() } }));
const input = { name: 'Web', namespace: 'apps', kind: 'deployment', resource: 'web' };
afterEach(() => { jest.restoreAllMocks(); });
it('validates persisted configuration and ignores client-supplied identities/timestamps', () => {
    expect(parseLogSource({ ...input, id: 'forged', updatedAt: 0 }, 'server-id')).toEqual(expect.objectContaining({ ...input, id: 'server-id' }));
    expect(parseLogSource({ ...input, kind: 'namespace', resource: '*' }).resource).toBe('apps');
    expect(parseLogSource({ ...input, container: 'web' }).container).toBe('web');
    for (const invalid of [null, {}, { ...input, namespace: '../apps' }, { ...input, name: 'a\nb' }, { ...input, kind: 'secret' }, { ...input, resource: '*' }, { ...input, container: 'bad/value' }]) expect(() => parseLogSource(invalid)).toThrow();
});
it('retains other saved sources during serialized concurrent updates', async () => {
    let config: Awaited<ReturnType<Awaited<ReturnType<typeof DatabaseFactory.getSystemRepository>>['getKubernetesLogConfig']>> = null;
    const repo = { getKubernetesLogConfig: async () => config, saveKubernetesLogConfig: async (value: typeof config) => { config = value; } };
    jest.mocked(DatabaseFactory.getSystemRepository).mockResolvedValue(repo as Awaited<ReturnType<typeof DatabaseFactory.getSystemRepository>>);
    expect(await KubernetesLogSources.list()).toEqual([]);
    await Promise.all(['one', 'two'].map(id => KubernetesLogSources.change(id, parseLogSource(input, id))));
    expect((await KubernetesLogSources.list()).map(source => source.id)).toEqual(['one', 'two']);
    await KubernetesLogSources.change('one'); expect((await KubernetesLogSources.list()).map(source => source.id)).toEqual(['two']);
});
it('serializes Kubernetes label expressions and never broadens a selectorless Service', () => {
    expect(selectorText({ matchLabels: { app: 'web' }, matchExpressions: [{ key: 'tier', operator: 'In', values: ['a', 'b'] }, { key: 'old', operator: 'DoesNotExist' }, { key: 'live', operator: 'Exists' }, { key: 'tier2', operator: 'NotIn', values: ['c'] }] })).toBe('app=web,tier in (a,b),!old,live,tier2 notin (c)');
    expect(() => selectorText()).toThrow('no pod selector');
    expect(() => selectorText({ matchExpressions: [{ key: 'x', operator: 'Unknown' }] })).toThrow();
});
it('resolves exact pods, Services and workload selectors including expression-only selectors', async () => {
    const read = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ spec: { selector: { matchExpressions: [{ key: 'app', operator: 'Exists' }] } } });
    const list = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ items: [{ metadata: { name: 'live' }, status: { phase: 'Running' } }, { status: { phase: 'Succeeded' } }, { metadata: { deletionTimestamp: new Date() } }] });
    const core = { readNamespacedPod: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ metadata: { name: 'exact' } }), readNamespacedService: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({ spec: { selector: { app: 'web' } } }), listNamespacedPod: list };
    const apps = { readNamespacedDeployment: read, readNamespacedStatefulSet: read, readNamespacedDaemonSet: read };
    const config = { makeApiClient: (type: unknown) => type === k8s.CoreV1Api ? core : apps } as unknown as k8s.KubeConfig;
    jest.mocked(KubernetesService.getInstance).mockReturnValue({ available: true, getKubeConfig: () => config } as KubernetesService);
    for (const kind of ['deployment', 'statefulset', 'daemonset', 'service', 'namespace']) expect(await resolveLogPods(parseLogSource({ ...input, kind }))).toHaveLength(1);
    expect(list).toHaveBeenCalledWith({ namespace: 'apps', labelSelector: 'app' });
    expect((await resolveLogPods(parseLogSource({ ...input, kind: 'pod' })))[0].metadata?.name).toBe('exact');
    jest.mocked(KubernetesService.getInstance).mockReturnValue({ available: false, getKubeConfig: () => config } as KubernetesService);
    await expect(resolveLogPods(parseLogSource(input))).rejects.toThrow('unavailable');
});

jest.mock('@kubernetes/client-node', () => ({ CoreV1Api: class {}, AppsV1Api: class {} }));
