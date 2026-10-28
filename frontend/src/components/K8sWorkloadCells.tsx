import type { KubernetesResourceDetails } from '../types/kubernetesResource';
function statusLabel(type: string, item: KubernetesResourceDetails) {
  if (type === 'cronjobs') return item.suspended ? 'Suspended' : 'Scheduled';
  if (type === 'jobs') {
    if (item.failedCondition) return 'Failed';
    if (item.completed) return 'Complete';
    return item.active ? 'Running' : 'Pending';
  }
  if (!item.desired) return 'Scaled to zero';
  return Number(item.readyReplicas) >= Number(item.desired) ? 'Ready' : 'Not ready';
}
export function K8sWorkloadCells({ type, item }: Readonly<{ type: string; item: KubernetesResourceDetails }>) {
  const values = workloadValues(type, item);
  return <>{values.map((value, index) => <td key={['target', 'current', 'status'][index]} className="px-4 py-2.5 text-xs text-text-dim tabular-nums">{value}</td>)}</>;
}
function workloadValues(type: string, item: KubernetesResourceDetails) {
  if (type === 'cronjobs') return [item.schedule || '—', String(item.active ?? 0), statusLabel(type, item)];
  if (type === 'jobs') return [`${item.succeeded ?? 0}/${item.completions ?? 1}`, `${item.active ?? 0} active · ${item.failed ?? 0} failed`, statusLabel(type, item)];
  return [String(item.desired ?? 0), String(item.readyReplicas ?? 0), statusLabel(type, item)];
}
