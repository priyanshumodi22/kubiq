import type { KubernetesResourceDetails } from '../types/kubernetesResource';
export const additionalWorkloads = [
  { id: 'statefulsets', label: 'StatefulSets', type: 'statefulsets' },
  { id: 'daemonsets', label: 'DaemonSets', type: 'daemonsets' },
  { id: 'replicasets', label: 'ReplicaSets', type: 'replicasets' },
  { id: 'jobs', label: 'Jobs', type: 'jobs' },
  { id: 'cronjobs', label: 'CronJobs', type: 'cronjobs' },
  { id: 'replicationcontrollers', label: 'ReplicationControllers', type: 'replicationcontrollers' },
];
export const additionalWorkloadTypes = new Set(additionalWorkloads.map(item => item.type));
export function podOwnerLabel(owners: KubernetesResourceDetails['ownerReferences']): string {
  const owner = owners?.find(item => item.controller) || owners?.[0];
  return owner ? `${owner.kind}/${owner.name}` : 'Standalone pod';
}
