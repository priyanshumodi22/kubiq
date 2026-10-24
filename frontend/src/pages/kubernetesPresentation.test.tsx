// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatContextName, getClusterProvider, persistentVolumeClass } from './kubernetesPresentation';
import { KubernetesResourceHead } from './KubernetesResourceHead';

afterEach(cleanup);
describe('Kubernetes presentation compatibility', () => {
  it('formats supported context identifiers without changing raw IDs', () => {
    expect(formatContextName('', [])).toBe('');
    expect(formatContextName('inCluster', [{ name: 'inCluster', cluster: 'fixture-cluster' }])).toBe('fixture-cluster');
    expect(formatContextName('inClusterContext', [{ name: 'inClusterContext', cluster: 'inClusterContext' }])).toBe('In-Cluster Kubernetes');
    expect(formatContextName('arn:aws:eks:ap-south-1:123:cluster/fixture', [])).toBe('fixture [EKS:ap-south-1]');
    expect(formatContextName('gke_project_region_fixture', [])).toBe('fixture [GKE]');
    expect(formatContextName('fixture_aks_region', [])).toBe('fixture [AKS]');
    expect(formatContextName('custom-context', [])).toBe('custom-context');
  });

  it('keeps provider classification and volume-state fallback behavior', () => {
    expect(['', 'arn:aws:eks:region:cluster/fixture', 'gke_project_region_cluster', 'fixture-azure', 'minikube', 'kind-fixture', 'docker-desktop', 'custom'].map(getClusterProvider)).toEqual([
      'Kubernetes Cluster', 'AWS Elastic Kubernetes Service', 'Google Kubernetes Engine', 'Azure Kubernetes Service', 'Minikube Local Development', 'Kind Cluster', 'Docker Desktop', 'Kubernetes Cluster',
    ]);
    expect(persistentVolumeClass('Bound')).toContain('text-green-400');
    expect(persistentVolumeClass('Available')).toContain('text-cyan-400');
    expect(persistentVolumeClass(undefined)).toContain('text-yellow-400');
    expect(persistentVolumeClass('Released')).toBe(persistentVolumeClass(undefined));
  });

  it.each([
    ['pods', ['Ready', 'Status', 'CPU', 'RAM', 'Restarts', 'Age']],
    ['deployments', ['Desired', 'Ready', 'Status']],
    ['services', ['Type', 'Ports', 'Age']], ['endpoints', ['Endpoints', 'Age']],
    ['ingresses', ['Class', 'Hosts', 'Age']], ['persistentvolumes', ['Capacity', 'Status', 'Claim', 'Age']],
    ['persistentvolumeclaims', ['Status', 'Volume', 'Capacity', 'Age']],
    ['storageclasses', ['Provisioner', 'Binding Mode', 'Age']], ['configmaps', ['Keys', 'Age']],
    ['secrets', ['Type', 'Keys', 'Age']], ['nodes', ['Status', 'Roles', 'Version', 'Age']], ['events', ['Age']],
  ] as Array<[string, string[]]>)('preserves %s column order', (resource, labels) => {
    const view = render(<table><thead><KubernetesResourceHead resource={resource} sort={null} onSort={vi.fn()} /></thead></table>);
    expect(view.getAllByRole('columnheader').map(cell => cell.textContent?.trim())).toEqual(['Name', ...labels, '']);
  });

  it('keeps sorting keyboard-operable and indicates the current direction', () => {
    const sort = vi.fn();
    const view = render(<table><thead><KubernetesResourceHead resource="pods" sort={{ key: 'restarts', asc: false }} onSort={sort} /></thead></table>);
    const restarts = view.getByRole('button', { name: 'Restarts ↓' });
    restarts.focus();
    expect(document.activeElement).toBe(restarts);
    fireEvent.click(restarts);
    expect(sort).toHaveBeenCalledWith('restarts');
    fireEvent.click(view.getByRole('button', { name: 'Name' }));
    expect(sort).toHaveBeenLastCalledWith('name');
  });
});
