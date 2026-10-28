import type { ComponentProps, ReactNode } from 'react';
import { K8sNamespaceOverview } from '../components/K8sNamespaceOverview';
import { K8sRelationshipMap } from '../components/K8sRelationshipMap';
import { K8sRbacPermissionBanner } from '../components/K8sRbacPermissionBanner';

interface ContentProps {
  failure?: string;
  error: { resource: string; namespace: string; message: string } | null;
  resource: string;
  namespace: string;
  data: (NonNullable<ComponentProps<typeof K8sNamespaceOverview>['data']> & { ingresses?: ComponentProps<typeof K8sRelationshipMap>['ingresses'] }) | null;
  onRetry: () => void;
  onSwitchTab: (tab: string) => void;
  onSelectItem: ComponentProps<typeof K8sNamespaceOverview>['onSelectItem'];
  children: ReactNode;
}

export function KubernetesSpecialContent({ failure, error, resource, namespace, data, onRetry, onSwitchTab, onSelectItem, children }: Readonly<ContentProps>) {
  if (failure) return <div role="alert" className="m-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-text-dim"><p>{failure}</p><button type="button" onClick={onRetry} className="mt-3 text-primary">Retry resource</button></div>;
  if (error) return <K8sRbacPermissionBanner resource={error.resource} namespace={error.namespace} message={error.message} onRetry={onRetry} />;
  if (resource === 'overview') return <K8sNamespaceOverview selectedNamespace={namespace} data={data} onSwitchTab={onSwitchTab} onSelectItem={onSelectItem} />;
  if (resource === 'topology') return <K8sRelationshipMap namespace={namespace} pods={data?.pods || []} services={data?.services || []} ingresses={data?.ingresses || []} configMaps={data?.configMaps || []} secrets={data?.secrets || []} onSelectItem={onSelectItem} />;
  return children;
}
