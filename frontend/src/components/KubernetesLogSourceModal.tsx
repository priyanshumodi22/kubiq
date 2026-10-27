import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { apiClient } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { apiErrorMessage } from '../utils/apiErrorMessage';
import type { KubernetesLogSource } from '../types/kubernetesLogs';

const control = 'mt-1 w-full rounded-lg border border-white/10 bg-bg p-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';
export function KubernetesLogSourceModal({ source, onClose, onSaved }: Readonly<{ source: KubernetesLogSource | null; onClose: () => void; onSaved: () => void }>) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(source?.name || '');
  const [namespace, setNamespace] = useState(source?.namespace || '');
  const [kind, setKind] = useState<KubernetesLogSource['kind']>(source?.kind || 'deployment');
  const [resource, setResource] = useState(source?.resource || '');
  const [container, setContainer] = useState(source?.container || '');
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [targets, setTargets] = useState<Array<{ name: string }>>([]);
  const [containers, setContainers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { addToast } = useToast();
  useEffect(() => {
    const trigger = document.activeElement;
    const element = dialog.current;
    element?.showModal();
    let active = true;
    apiClient.getKubernetesLogNamespaces().then(value => { if (active) setNamespaces(value); }).catch(error => { if (active) setError(apiErrorMessage(error, 'Cannot load permitted namespaces.')); });
    return () => { active = false; element?.close(); if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus(); };
  }, []);
  useEffect(() => {
    let active = true;
    setTargets([]);
    if (!namespace || kind === 'namespace') { setLoading(false); return; }
    setLoading(true); setError('');
    apiClient.getKubernetesLogTargets(namespace, kind).then(value => { if (active) setTargets(value); }).catch(error => { if (active) setError(apiErrorMessage(error, 'Cannot load Kubernetes targets.')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [namespace, kind]);
  useEffect(() => {
    let active = true;
    setContainers([]);
    if (!namespace || (kind !== 'namespace' && !resource)) return;
    apiClient.getKubernetesLogContainers(namespace, kind, resource).then(value => { if (active) setContainers(value); }).catch(error => { if (active) setError(apiErrorMessage(error, 'Cannot discover containers.')); });
    return () => { active = false; };
  }, [namespace, kind, resource]);
  const save = async () => {
    if (saving) return;
    if (!name.trim() || !namespace || (kind !== 'namespace' && !resource)) {
      setError('Enter a label and choose a namespace and target.');
      addToast('Complete the Kubernetes log source fields.', 'warning'); return;
    }
    setSaving(true); setError('');
    try {
      await apiClient.saveKubernetesLogSource({ name: name.trim(), namespace, kind, resource, container }, source?.id);
      addToast('Kubernetes log source saved.', 'success'); onSaved(); onClose();
    } catch (error) { const message = apiErrorMessage(error, 'Could not save the log source.'); setError(message); addToast(message, 'error'); }
    finally { setSaving(false); }
  };
  return <dialog ref={dialog} aria-label="Configure Kubernetes log source" onCancel={event => { event.preventDefault(); if (!saving) onClose(); }} className="fixed inset-0 m-0 h-screen max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-inherit">
    <ConfirmDialog isOpen type="info" title="Kubernetes log source" message="Follow matching pods and containers, including replacements." confirmText="Save source" onConfirm={() => { void save(); }} onClose={onClose} isLoading={saving || loading}>
      <div className="mb-5 space-y-3 text-left">
        {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        <label className="block text-xs text-text-dim">Source label<input autoFocus maxLength={80} value={name} onChange={event => setName(event.target.value)} className={control} /></label>
        <label className="block text-xs text-text-dim">Namespace<select value={namespace} onChange={event => { setNamespace(event.target.value); setResource(''); setContainer(''); }} className={control}><option value="">Choose namespace</option>{namespaces.map(item => <option key={item}>{item}</option>)}</select></label>
        <label className="block text-xs text-text-dim">Resource type<select value={kind} onChange={event => { setKind(event.target.value as KubernetesLogSource['kind']); setResource(''); setContainer(''); }} className={control}>{['deployment', 'service', 'statefulset', 'daemonset', 'pod', 'namespace'].map(item => <option key={item} value={item}>{item === 'namespace' ? 'Entire namespace' : item}</option>)}</select></label>
        {kind !== 'namespace' && <label className="block text-xs text-text-dim">Resource<select disabled={loading || !namespace} value={resource} onChange={event => { setResource(event.target.value); setContainer(''); }} className={control}><option value="">{loading ? 'Loading targets…' : 'Choose resource'}</option>{targets.map(item => <option key={item.name}>{item.name}</option>)}</select></label>}
        <label className="block text-xs text-text-dim">Container<select value={container} onChange={event => setContainer(event.target.value)} className={control}><option value="">All containers</option>{containers.map(item => <option key={item}>{item}</option>)}</select></label>
        <p className="text-[11px] text-text-dim">Uses kubiq’s default Kubernetes connection. Up to 20 container streams per viewer. Each line identifies its namespace, pod and container. Logs are collected while the viewer is connected.</p>
      </div>
    </ConfirmDialog>
  </dialog>;
}
