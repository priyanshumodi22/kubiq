import type { KubernetesResourceDetails } from '../types/kubernetesResource';

function resourceSortValue(item: KubernetesResourceDetails, resource: string, key: string) {
  if (resource !== 'pods') return item.metadata?.name || item.name || '';
  if (key === 'restarts') return item.restarts;
  if (key === 'age') return new Date(item.startTime === null ? 0 : item.startTime ?? Number.NaN).getTime();
  return item.name;
}

export function compareKubernetesResources(a: KubernetesResourceDetails, b: KubernetesResourceDetails, resource: string, sort: { key: string; asc: boolean }): number {
  const left = resourceSortValue(a, resource, sort.key);
  const right = resourceSortValue(b, resource, sort.key);
  if (left === undefined || right === undefined) return 0;
  if (left < right) return sort.asc ? -1 : 1;
  if (left > right) return sort.asc ? 1 : -1;
  return 0;
}

export function formatContextName(name: string, contexts: Array<{ name: string; cluster?: string | null }>) {
  if (!name) return '';
  if (name === 'inClusterContext' || name === 'inCluster') {
    const cluster = contexts.find(context => context.name === name)?.cluster;
    return cluster && cluster !== 'inClusterContext' ? cluster : 'In-Cluster Kubernetes';
  }
  if (name.startsWith('arn:aws:eks:')) {
    const clusterName = name.split('/').at(-1);
    const region = /eks:([a-z0-9-]+):/.exec(name)?.[1] || '';
    return region ? `${clusterName} [EKS:${region}]` : `${clusterName} [EKS]`;
  }
  if (name.startsWith('gke_')) return `${name.split('_').at(-1)} [GKE]`;
  if (name.includes('_') && (name.toLowerCase().includes('aks') || name.toLowerCase().includes('azure'))) return `${name.split('_')[0]} [AKS]`;
  return name;
}

export function getClusterProvider(name: string) {
  if (!name) return 'Kubernetes Cluster';
  if (name.startsWith('arn:aws:eks:')) return 'AWS Elastic Kubernetes Service';
  if (name.startsWith('gke_')) return 'Google Kubernetes Engine';
  if (name.toLowerCase().includes('aks') || name.toLowerCase().includes('azure')) return 'Azure Kubernetes Service';
  if (name.includes('minikube')) return 'Minikube Local Development';
  if (name.includes('kind')) return 'Kind Cluster';
  if (name.includes('docker-desktop')) return 'Docker Desktop';
  return 'Kubernetes Cluster';
}

export function persistentVolumeClass(phase?: string) {
  if (phase === 'Bound') return 'bg-green-500/10 text-green-400 border border-green-500/20';
  if (phase === 'Available') return 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20';
  return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
}
