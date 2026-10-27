import { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useAppDialog } from '../hooks/useAppDialog';
import { apiErrorMessage } from '../utils/apiErrorMessage';
import type { KubernetesLogSource } from '../types/kubernetesLogs';

export function SavedKubernetesLogSources({ version, search, selectedId, onSelect, onEdit, onRemoved }: Readonly<{ version: number; search: string; selectedId?: string; onSelect: (source: KubernetesLogSource) => void; onEdit: (source: KubernetesLogSource) => void; onRemoved: () => void }>) {
  const [sources, setSources] = useState<KubernetesLogSource[]>([]);
  const [error, setError] = useState('');
  const { hasPermission } = useAuth();
  const { addToast } = useToast();
  const appDialog = useAppDialog();
  const permitted = hasPermission('kubernetes.read');
  const manage = hasPermission('services.manage') && hasPermission('logs.raw.read');
  useEffect(() => {
    let active = true;
    if (!permitted) return;
    apiClient.getKubernetesLogSources().then(value => { if (active) { setSources(value); setError(''); } }).catch(error => { if (active) setError(apiErrorMessage(error, 'Could not load saved Kubernetes sources.')); });
    return () => { active = false; };
  }, [version, permitted]);
  const remove = async (source: KubernetesLogSource) => {
    if (!(await appDialog.confirm({ title: 'Remove log source', message: `Remove ${source.name}? This removes the saved configuration; retained logs are unchanged.`, confirmText: 'Remove source' }))) return;
    try { await apiClient.removeKubernetesLogSource(source.id); addToast('Log source removed.', 'success'); onRemoved(); }
    catch (error) { addToast(apiErrorMessage(error, 'Could not remove log source.'), 'error'); }
  };
  if (!permitted) return null;
  return <section aria-label="Saved Kubernetes log sources" className="border-t border-white/10 pt-3 mt-3">
    <h3 className="px-2 mb-2 text-xs font-semibold text-text-dim">Kubernetes</h3>
    {error && <p role="alert" className="p-2 text-xs text-red-400">{error}</p>}
    {!error && !sources.length && <p className="p-2 text-xs text-text-dim">No Kubernetes sources saved.</p>}
    {sources.filter(source => `${source.name} ${source.namespace} ${source.resource}`.toLowerCase().includes(search.toLowerCase())).map(source => <div key={source.id} className={`mb-1 rounded-lg border p-2 ${selectedId === source.id ? 'border-primary/30 bg-primary/10' : 'border-transparent bg-white/3'}`}>
      <button type="button" onClick={() => onSelect(source)} aria-pressed={selectedId === source.id} aria-label={`View logs for ${source.name}`} className="w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="block truncate text-sm text-text">{source.name}</span><span className="block truncate text-[10px] text-text-dim">{source.namespace} · {source.kind}/{source.resource} · {source.container || 'all containers'}</span></button>
      {manage && <div className="mt-2 flex gap-3 text-[11px]"><button type="button" onClick={() => onEdit(source)} className="text-primary">Edit {source.name}</button><button type="button" onClick={() => { void remove(source); }} className="text-red-400">Remove {source.name}</button></div>}
    </div>)}
    {appDialog.dialog}
  </section>;
}
