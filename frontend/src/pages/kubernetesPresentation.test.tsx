// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compareKubernetesResources, formatContextName, getClusterProvider, persistentVolumeClass } from './kubernetesPresentation';
import { KubernetesResourceHead } from './KubernetesResourceHead';

afterEach(cleanup);
describe('Kubernetes presentation compatibility', () => {
  it('sorts pod restart counts and names in both directions while keeping missing values tied', () => {
    expect(compareKubernetesResources({ restarts: 1 }, { restarts: 3 }, 'pods', { key: 'restarts', asc: true })).toBe(-1);
    expect(compareKubernetesResources({ restarts: 1 }, { restarts: 3 }, 'pods', { key: 'restarts', asc: false })).toBe(1);
    expect(compareKubernetesResources({}, { restarts: 3 }, 'pods', { key: 'restarts', asc: true })).toBe(0);
    expect(compareKubernetesResources({ name: 'z' }, { name: 'a' }, 'pods', { key: 'name', asc: true })).toBe(1);
    expect(compareKubernetesResources({ name: 'a' }, { name: 'z' }, 'pods', { key: 'name', asc: false })).toBe(1);
    expect(compareKubernetesResources({ name: 'a' }, { name: 'a' }, 'pods', { key: 'name', asc: true })).toBe(0);
  });

  it('preserves null epoch and invalid date ties in age sorting', () => {
    const older = { startTime: null };
    const newer = { startTime: '2026-01-01T00:00:00Z' };
    expect(compareKubernetesResources(older, newer, 'pods', { key: 'age', asc: true })).toBe(-1);
    expect(compareKubernetesResources({}, newer, 'pods', { key: 'age', asc: true })).toBe(0);
    expect(compareKubernetesResources({ startTime: 'invalid' }, newer, 'pods', { key: 'age', asc: false })).toBe(0);
  });

  it('prefers raw resource metadata names over normalized names', () => {
    expect(compareKubernetesResources({ name: 'z', metadata: { name: 'a' } }, { name: 'b' }, 'services', { key: 'name', asc: true })).toBe(-1);
    expect(compareKubernetesResources({}, { name: 'b' }, 'services', { key: 'name', asc: true })).toBe(-1);
  });

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
