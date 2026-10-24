// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KubernetesDashboard from './KubernetesDashboard';

const mocks = vi.hoisted(() => ({
  available: true as boolean | null, switchContext: vi.fn(), setNamespace: vi.fn(),
  pods: vi.fn(), deployments: vi.fn(), services: vi.fn(), configMaps: vi.fn(), secrets: vi.fn(), events: vi.fn(), metrics: vi.fn(),
  nodes: vi.fn(), endpoints: vi.fn(), ingresses: vi.fn(), volumes: vi.fn(), claims: vi.fn(), classes: vi.fn(),
}));
vi.mock('../hooks/useKubernetes', () => ({ useKubernetes: () => ({ available: mocks.available, context: 'fixture-context', contexts: [{ name: 'fixture-context', cluster: 'fixture', user: 'fixture-user' }, { name: 'gke_fixture_region_cluster', cluster: 'cluster' }], switchContext: mocks.switchContext, namespaces: ['fixture', 'apps'], selectedNamespace: 'fixture', setSelectedNamespace: mocks.setNamespace }) }));
vi.mock('../services/api', () => ({ apiClient: {
  getKubernetesPods: mocks.pods, getKubernetesDeployments: mocks.deployments, getKubernetesServices: mocks.services,
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
  for (const key of ['pods', 'deployments', 'services', 'configMaps', 'secrets', 'events', 'metrics', 'nodes', 'endpoints', 'ingresses', 'volumes', 'claims', 'classes'] as const) mocks[key].mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Kubernetes explorer request and rendering lifecycle', () => {
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
