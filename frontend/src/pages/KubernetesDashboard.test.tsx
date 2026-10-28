// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KubernetesDashboard from './KubernetesDashboard';

const mocks = vi.hoisted(() => ({
  available: true as boolean | null, switchContext: vi.fn(), setNamespace: vi.fn(),
  workloads: vi.fn(), pods: vi.fn(), deployments: vi.fn(), services: vi.fn(), configMaps: vi.fn(), secrets: vi.fn(), events: vi.fn(), metrics: vi.fn(),
  nodes: vi.fn(), endpoints: vi.fn(), ingresses: vi.fn(), volumes: vi.fn(), claims: vi.fn(), classes: vi.fn(),
}));
vi.mock('../hooks/useKubernetes', () => ({ useKubernetes: () => ({ available: mocks.available, context: 'fixture-context', contexts: [{ name: 'fixture-context', cluster: 'fixture', user: 'fixture-user' }, { name: 'gke_fixture_region_cluster', cluster: 'cluster' }], switchContext: mocks.switchContext, namespaces: ['fixture', 'apps'], selectedNamespace: 'fixture', setSelectedNamespace: mocks.setNamespace }) }));
vi.mock('../services/api', () => ({ apiClient: {
  getKubernetesWorkloads: mocks.workloads, getKubernetesPods: mocks.pods, getKubernetesDeployments: mocks.deployments, getKubernetesServices: mocks.services,
  getKubernetesConfigMaps: mocks.configMaps, getKubernetesSecrets: mocks.secrets, getKubernetesEvents: mocks.events,
  getKubernetesMetrics: mocks.metrics, getKubernetesNodes: mocks.nodes, getKubernetesEndpoints: mocks.endpoints,
  getKubernetesIngresses: mocks.ingresses, getKubernetesPersistentVolumes: mocks.volumes,
  getKubernetesPersistentVolumeClaims: mocks.claims, getKubernetesStorageClasses: mocks.classes,
} }));
vi.mock('../components/K8sNamespaceOverview', () => ({ K8sNamespaceOverview: () => <section>Fixture overview</section> }));
vi.mock('../components/K8sRelationshipMap', () => ({ K8sRelationshipMap: () => <section>Fixture topology</section> }));
vi.mock('../components/K8sMiniSparkline', () => ({ K8sMiniSparkline: () => <span>Metric history</span> }));
vi.mock('../components/K8sDetailPanel', () => ({ K8sDetailPanel: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>Close fixture detail</button> }));
vi.mock('../components/K8sRbacPermissionBanner', () => ({ K8sRbacPermissionBanner: ({ onRetry }: { onRetry: () => void }) => <button onClick={onRetry}>Retry denied resource</button> }));

beforeEach(() => {
  vi.resetAllMocks(); mocks.available = true; localStorage.clear();
  for (const key of ['workloads', 'pods', 'deployments', 'services', 'configMaps', 'secrets', 'events', 'metrics', 'nodes', 'endpoints', 'ingresses', 'volumes', 'claims', 'classes'] as const) mocks[key].mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Kubernetes explorer request and rendering lifecycle', () => {
  it.each([
    { tab: 'Nodes', request: 'nodes', group: '', row: { metadata: { name: 'fallback-resource' } }, cells: ['NotReady', 'worker', '—'] },
    { tab: 'Persistent Volume Claims', request: 'claims', group: 'Storage', row: { metadata: { name: 'fallback-resource' }, spec: { volumeName: 'fixture-volume', resources: { requests: { storage: '12Gi' } } } }, cells: ['Bound', 'fixture-volume', '12Gi'] },
    { tab: 'Endpoints', request: 'endpoints', group: '', row: { metadata: { name: 'fallback-resource' }, subsets: [{ addresses: [{ ip: '10.0.0.6' }] }] }, cells: ['10.0.0.6:'] },
  ] as const)('keeps $tab fallback values usable for partial API objects', async ({ tab, request, group, row, cells }) => {
    mocks[request].mockResolvedValue([row]);
    const view = render(<KubernetesDashboard />);
    await waitFor(() => expect(mocks.pods).toHaveBeenCalled());
    if (group) fireEvent.click(view.getByRole('button', { name: group }));
    fireEvent.click(view.getByRole('button', { name: tab }));
    await view.findByText('fallback-resource');
    for (const cell of cells) expect(view.getAllByRole('cell', { name: cell }).length).toBeGreaterThan(0);
  });

  it.each([
    { tab: 'Services', request: 'services', group: '', row: { metadata: { name: 'fixture-resource' }, spec: { type: 'ClusterIP', ports: [{ port: 8080, protocol: 'TCP' }] } }, cells: ['ClusterIP', '8080/TCP'] },
    { tab: 'Endpoints', request: 'endpoints', group: '', row: { metadata: { name: 'fixture-resource' }, subsets: [{ addresses: [{ ip: '10.0.0.5' }], ports: [{ port: 8080 }] }] }, cells: ['10.0.0.5:8080'] },
    { tab: 'Ingresses', request: 'ingresses', group: '', row: { metadata: { name: 'fixture-resource' }, spec: { ingressClassName: 'traefik', rules: [{ host: 'fixture.example.test' }] } }, cells: ['traefik', 'fixture.example.test'] },
    { tab: 'Persistent Volumes', request: 'volumes', group: 'Storage', row: { metadata: { name: 'fixture-resource' }, spec: { capacity: { storage: '30Gi' }, claimRef: { name: 'fixture-claim' } }, status: { phase: 'Available' } }, cells: ['30Gi', 'Available', 'fixture-claim'] },
    { tab: 'Persistent Volume Claims', request: 'claims', group: 'Storage', row: { metadata: { name: 'fixture-resource' }, spec: { volumeName: 'fixture-volume' }, status: { phase: 'Bound', capacity: { storage: '20Gi' } } }, cells: ['Bound', 'fixture-volume', '20Gi'] },
    { tab: 'Storage Classes', request: 'classes', group: 'Storage', row: { metadata: { name: 'fixture-resource' }, provisioner: 'rancher.io/local-path', volumeBindingMode: 'WaitForFirstConsumer' }, cells: ['rancher.io/local-path', 'WaitForFirstConsumer'] },
    { tab: 'Nodes', request: 'nodes', group: '', row: { metadata: { name: 'fixture-resource', labels: { 'node-role.kubernetes.io/control-plane': '' } }, status: { conditions: [{ type: 'Ready', status: 'True' }], nodeInfo: { kubeletVersion: 'v1.36.4' } } }, cells: ['Ready', 'control-plane', 'v1.36.4'] },
    { tab: 'Deployments', request: 'deployments', group: '', row: { name: 'fixture-resource', replicas: 2, readyReplicas: 2 }, cells: ['2/2', 'Healthy'] },
    { tab: 'Secrets', request: 'secrets', group: 'Configuration', row: { metadata: { name: 'fixture-resource' }, type: 'Opaque', data: { fixture: 'fixture-only' } }, cells: ['Opaque', '1 keys'] },
  ] as const)('renders $tab values and keeps the resource inspectable', async ({ tab, request, group, row, cells }) => {
    mocks[request].mockResolvedValue([row]);
    const view = render(<KubernetesDashboard />);
    await waitFor(() => expect(mocks.pods).toHaveBeenCalled());
    if (group) fireEvent.click(view.getByRole('button', { name: group }));
    fireEvent.click(view.getByRole('button', { name: tab }));
    const name = await view.findByText('fixture-resource');
    for (const cell of cells) expect(view.getByRole('cell', { name: cell })).toBeTruthy();
    fireEvent.click(name);
    expect(view.getByRole('button', { name: 'Close fixture detail' })).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Close fixture detail' }));
    expect(view.queryByRole('button', { name: 'Close fixture detail' })).toBeNull();
  });

  it('loads the overview and preserves namespace and context selection contracts', async () => {
    const view = render(<KubernetesDashboard />);
    await waitFor(() => expect(mocks.pods).toHaveBeenCalledWith('fixture'));
    expect(view.getByText('Fixture overview')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: /fixture-context/ }));
    fireEvent.click(view.getByRole('button', { name: /cluster \[GKE\]/ }));
    expect(mocks.switchContext).toHaveBeenCalledWith('gke_fixture_region_cluster');
    fireEvent.click(view.getByRole('button', { name: /^fixture$/ }));
    fireEvent.click(view.getByRole('button', { name: /^apps$/ }));
    expect(mocks.setNamespace).toHaveBeenCalledWith('apps');
  });

  it('renders pod selection, filters rows and preserves cluster-scoped routing', async () => {
    mocks.pods.mockResolvedValue([{ name: 'fixture-pod', status: 'Running', readyCount: 1, totalContainers: 1, restarts: 0, startTime: '2026-10-24T10:00:00Z' }]);
    const view = render(<KubernetesDashboard />);
    await waitFor(() => expect(mocks.pods).toHaveBeenCalled());
    fireEvent.click(view.getByRole('button', { name: /^Pods$/ }));
    fireEvent.click(await view.findByText('fixture-pod'));
    fireEvent.click(view.getByRole('button', { name: 'Close fixture detail' }));
    fireEvent.change(view.getByPlaceholderText('Search name...'), { target: { value: 'missing' } });
    expect(view.queryByText('fixture-pod')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: /^Nodes$/ }));
    await waitFor(() => expect(mocks.nodes).toHaveBeenCalledWith());
    fireEvent.click(view.getByRole('button', { name: /^Configuration$/ }));
    fireEvent.click(view.getByRole('button', { name: /^Secrets$/ }));
    await waitFor(() => expect(mocks.secrets).toHaveBeenCalledWith('fixture'));
  });

  it('shows permission failure and retries without presenting denied data as healthy', async () => {
    const view = render(<KubernetesDashboard />);
    await waitFor(() => expect(mocks.pods).toHaveBeenCalled());
    mocks.pods.mockRejectedValue({ response: { status: 403, data: { error: 'RBAC_FORBIDDEN', message: 'Fixture denied' } } });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      fireEvent.click(view.getByRole('button', { name: /^Pods$/ }));
      const retry = await view.findByRole('button', { name: 'Retry denied resource' });
      mocks.pods.mockResolvedValue([]);
      fireEvent.click(retry);
      await waitFor(() => expect(view.queryByRole('button', { name: 'Retry denied resource' })).toBeNull());
      expect(view.getByText('No pods found')).toBeTruthy();
    } finally { log.mockRestore(); }
  });

  it('refreshes periodically and stops its timer when the explorer unmounts', async () => {
    vi.useFakeTimers();
    const view = render(<KubernetesDashboard />);
    await act(async () => { await Promise.resolve(); });
    const initial = mocks.pods.mock.calls.length;
    for (let second = 0; second < 30; second++) await act(async () => { vi.advanceTimersByTime(1000); });
    expect(mocks.pods.mock.calls.length).toBeGreaterThan(initial);
    view.unmount();
    const stopped = mocks.pods.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(mocks.pods).toHaveBeenCalledTimes(stopped);
  });

  it('does not request resources while the cluster is unavailable', () => {
    mocks.available = false;
    const view = render(<KubernetesDashboard />);
    expect(view.getByRole('heading', { name: 'Kubernetes Not Configured' })).toBeTruthy();
    expect(mocks.pods).not.toHaveBeenCalled();
  });
});

it.each([['StatefulSets','statefulsets'],['DaemonSets','daemonsets'],['ReplicaSets','replicasets'],['Jobs','jobs'],['CronJobs','cronjobs'],['ReplicationControllers','replicationcontrollers']])('loads %s and opens its details', async (label, type) => {
  mocks.workloads.mockResolvedValue([{ name: 'workload-fixture', desired: 1, readyReplicas: 1 }]);
  const view = render(<KubernetesDashboard />);
  fireEvent.click(view.getByRole('button', { name: label }));
  await view.findByText('workload-fixture');
  expect(mocks.workloads).toHaveBeenCalledWith('fixture', type);
  const row = view.getByText('workload-fixture').closest('tr')!;
  expect(row.querySelectorAll('td')).toHaveLength(view.getAllByRole('columnheader').length);
  fireEvent.click(view.getByText('workload-fixture')); expect(view.getByRole('button', { name: 'Close fixture detail' })).toBeTruthy();
});
it('identifies the controlling workload of a pod', async () => {
  mocks.pods.mockResolvedValue([{ name: 'mongodb-0', status: 'Running', ownerReferences: [{ kind: 'StatefulSet', name: 'mongodb', controller: true }] }]);
  const view = render(<KubernetesDashboard />); fireEvent.click(view.getByRole('button', { name: 'Pods' }));
  expect(await view.findByText('StatefulSet/mongodb')).toBeTruthy();
});

it('shows unavailable workload data as an error with retry rather than an empty result', async () => {
  mocks.workloads.mockRejectedValueOnce(new Error('API unavailable'));
  const view = render(<KubernetesDashboard />); const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    fireEvent.click(view.getByRole('button', { name: 'StatefulSets' }));
    expect(await view.findByRole('alert')).toBeTruthy(); expect(view.queryByText('No statefulsets found')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Retry resource' }));
    await waitFor(() => expect(view.queryByRole('alert')).toBeNull());
  } finally { log.mockRestore(); }
});
it('ignores an older workload response after selecting another resource', async () => {
  let finish!: (value: unknown[]) => void;
  mocks.workloads.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce([{ name: 'current-daemonset', desired: 1, readyReplicas: 1 }]);
  const view = render(<KubernetesDashboard />);
  fireEvent.click(view.getByRole('button', { name: 'StatefulSets' }));
  fireEvent.click(view.getByRole('button', { name: 'DaemonSets' }));
  await view.findByText('current-daemonset');
  await act(async () => finish([{ name: 'stale-statefulset' }]));
  expect(view.getByText('current-daemonset')).toBeTruthy(); expect(view.queryByText('stale-statefulset')).toBeNull();
});
