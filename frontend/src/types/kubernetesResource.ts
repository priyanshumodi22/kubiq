import type { KubeCondition, KubeContainer, KubeEvent, KubePod } from '../hooks/useKubernetes';
import type { RelationshipResource } from '../components/k8sRelationshipData';

export type ResourceContainer = Pick<KubeContainer, 'name' | 'image'> & Partial<Omit<KubeContainer, 'name' | 'image' | 'state'>> & {
  state?: string;
  imageID?: string;
  securityContext?: { runAsNonRoot?: boolean; privileged?: boolean; readOnlyRootFilesystem?: boolean };
};

/** Fields consumed by the inspector from normalized workloads and raw Kubernetes objects. */
export type KubernetesResourceDetails = Partial<Omit<KubePod, 'containers' | 'status'> & KubeEvent> & {
  status?: string | { phase?: string; reason?: string; capacity?: { storage?: string }; conditions?: KubeCondition[]; nodeInfo?: { kubeletVersion?: string } };
  isTerminating?: boolean;
  replicas?: number;
  readyReplicas?: number;
  provisioner?: string;
  volumeBindingMode?: string;
  data?: Record<string, unknown>;
  subsets?: Array<{ addresses?: Array<{ ip?: string }>; ports?: Array<{ port?: number }> }>;
  containers?: ResourceContainer[];
  metadata?: { name?: string; namespace?: string; creationTimestamp?: string; labels?: Record<string, string> };
  spec?: RelationshipResource['spec'] & {
    nodeName?: string; containers?: ResourceContainer[]; template?: { spec?: { containers?: ResourceContainer[] } };
    type?: string; ports?: Array<{ port?: number; protocol?: string }>; ingressClassName?: string;
    capacity?: { storage?: string }; claimRef?: { name?: string }; volumeName?: string;
    resources?: { requests?: { storage?: string } };
  };
};

export interface KubernetesSelection { type: string; data: KubernetesResourceDetails }
