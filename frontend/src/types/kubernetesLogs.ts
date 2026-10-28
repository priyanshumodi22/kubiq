export interface KubernetesLogSource {
  id: string;
  name: string;
  namespace: string;
  kind: 'service' | 'deployment' | 'statefulset' | 'daemonset' | 'replicaset' | 'job' | 'cronjob' | 'replicationcontroller' | 'pod' | 'namespace';
  resource: string;
  container?: string;
  updatedAt: number;
}
