import { useEffect, useState } from 'react';
import { LogSourceDialog, logSourcePrimary, logSourceSecondary } from './LogSourceDialog';
import { CustomSelect } from './CustomSelect';
import { apiClient } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { apiErrorMessage } from '../utils/apiErrorMessage';
import type { KubernetesLogSource } from '../types/kubernetesLogs';

const control = 'mt-1 w-full rounded-lg border border-white/10 bg-bg p-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';
export function KubernetesLogSourceModal({ source, onClose, onSaved }: Readonly<{ source: KubernetesLogSource | null; onClose: () => void; onSaved: () => void }>) {
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
    let active = true;
    apiClient.getKubernetesLogNamespaces().then(value => { if (active) setNamespaces(value); }).catch(error => { if (active) setError(apiErrorMessage(error, 'Cannot load permitted namespaces.')); });
    return () => { active = false; };
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
  return <LogSourceDialog title="Kubernetes log source" description="Follow matching pods and containers, including replacements." busy={saving} onClose={onClose} actions={<>
    <button type="button" disabled={saving} onClick={onClose} className={logSourceSecondary}>Cancel</button>
    <button type="button" disabled={saving || loading} onClick={() => { void save(); }} className={logSourcePrimary}>{saving ? 'Saving…' : 'Save source'}</button>
  </>}>
    <div className="space-y-4 text-left">
      {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">{error}</p>}
      <label className="block text-xs font-medium text-text-dim">Source label<input autoFocus maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. MongoDB logs" className={control} /></label>
      <SourceSelect label="Namespace" value={namespace} onChange={value => { setNamespace(value); setResource(''); setContainer(''); }} options={[{ value: '', label: 'Choose namespace' }, ...namespaces.map(value => ({ value, label: value }))]} />
      <SourceSelect label="Resource type" value={kind} onChange={value => { setKind(value as KubernetesLogSource['kind']); setResource(''); setContainer(''); }} options={resourceOptions} />
      {kind !== 'namespace' && <SourceSelect label="Resource" value={resource} disabled={loading || !namespace} onChange={value => { setResource(value); setContainer(''); }} options={[{ value: '', label: loading ? 'Loading targets…' : 'Choose resource' }, ...targets.map(item => ({ value: item.name, label: item.name }))]} />}
      <SourceSelect label="Container" value={container} onChange={setContainer} placement="top" options={[{ value: '', label: 'All containers' }, ...containers.map(value => ({ value, label: value }))]} />
      <p className="text-xs leading-relaxed text-text-dim">Uses kubiq’s default Kubernetes connection. Up to 20 container streams per viewer. Each line identifies its namespace, pod and container. Logs are collected while the viewer is connected. Finished-container tails are limited to 256 KiB each.</p>
    </div>
  </LogSourceDialog>;
}
const resourceOptions = [
  ['deployment', 'Deployment'], ['statefulset', 'StatefulSet'], ['daemonset', 'DaemonSet'], ['replicaset', 'ReplicaSet'],
  ['job', 'Job'], ['cronjob', 'CronJob'], ['replicationcontroller', 'ReplicationController'], ['service', 'Service'], ['pod', 'Pod'], ['namespace', 'Entire namespace'],
].map(([value, label]) => ({ value, label }));
function SourceSelect(props: Readonly<Parameters<typeof CustomSelect<string>>[0]>) {
  return <div className="space-y-1.5"><span className="block text-xs font-medium text-text-dim">{props.label}</span><CustomSelect {...props} /></div>;
}
