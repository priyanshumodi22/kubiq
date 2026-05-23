import React, { useState, useEffect } from 'react';
import { Editor } from '@monaco-editor/react';
import { Activity, Maximize2, X, Code, Plus, Save, TrendingUp, Trash } from 'lucide-react';
import yamlParser from 'js-yaml';
import { apiClient } from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { K8sConfirmModal } from './K8sConfirmModal';

interface K8sAutoscalerPanelProps {
    item: any;
    namespace: string;
    onApplyManifest: (manifest: string) => Promise<void>;
}

export const K8sAutoscalerPanel: React.FC<K8sAutoscalerPanelProps> = ({ item, namespace, onApplyManifest }) => {
    const [autoscalers, setAutoscalers] = useState<{ hpa: any[], vpa: any[] } | null>(null);
    const [loadingAutoscalers, setLoadingAutoscalers] = useState(false);
    
    // Autoscaler Editing State
    const [editingHpa, setEditingHpa] = useState(false);
    const [hpaYamlEditor, setHpaYamlEditor] = useState<string>('');
    const [applyingHpa, setApplyingHpa] = useState(false);
    
    const [editingVpa, setEditingVpa] = useState(false);
    const [vpaYamlEditor, setVpaYamlEditor] = useState<string>('');
    const [applyingVpa, setApplyingVpa] = useState(false);

    const [hpaToDelete, setHpaToDelete] = useState<string | null>(null);
    const [vpaToDelete, setVpaToDelete] = useState<string | null>(null);

    const { addToast } = useToast() as any;

    const resName = item.data.name || item.data.metadata?.name;
    const resNs = item.data.namespace || item.data.metadata?.namespace || namespace;

    useEffect(() => {
        setLoadingAutoscalers(true);
        apiClient.getKubernetesAutoscalers(resNs, item.type, resName)
            .then(data => setAutoscalers(data))
            .catch(err => console.error("Failed to load autoscalers", err))
            .finally(() => setLoadingAutoscalers(false));
    }, [item, resNs, resName]);

    const loadHpaYaml = async (hpa: any) => {
        try {
            const ns = hpa.metadata.namespace;
            const name = hpa.metadata.name;
            const data = await apiClient.getKubernetesResourceYaml(ns, 'horizontalpodautoscalers', name);
            setHpaYamlEditor(yamlParser.dump(data, { indent: 2, noRefs: true }));
            setEditingHpa(true);
        } catch (e: any) { addToast(`Failed to load HPA YAML: ${e.message}`, 'error'); }
    };

    const loadVpaYaml = async (vpa: any) => {
        try {
            const ns = vpa.metadata.namespace;
            const name = vpa.metadata.name;
            const data = await apiClient.getKubernetesResourceYaml(ns, 'verticalpodautoscalers', name);
            setVpaYamlEditor(yamlParser.dump(data, { indent: 2, noRefs: true }));
            setEditingVpa(true);
        } catch (e: any) { addToast(`Failed to load VPA YAML: ${e.message}`, 'error'); }
    };

    const generateHpaBoilerplate = () => {
        let targetApiVersion = 'apps/v1';
        if (item.type === 'deploymentconfigs') targetApiVersion = 'apps.openshift.io/v1';
        
        let targetKind = 'Deployment';
        if (item.type === 'statefulsets') targetKind = 'StatefulSet';
        if (item.type === 'daemonsets') targetKind = 'DaemonSet';
        if (item.type === 'deploymentconfigs') targetKind = 'DeploymentConfig';
        if (item.type === 'replicasets') targetKind = 'ReplicaSet';

        const boilerplate = `apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ${resName}-hpa
  namespace: ${resNs || namespace}
spec:
  scaleTargetRef:
    apiVersion: ${targetApiVersion}
    kind: ${targetKind}
    name: ${resName}
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 75
  # Uncomment below to scale on Memory as well
  #- type: Resource
  #  resource:
  #    name: memory
  #    target:
  #      type: Utilization
  #      averageUtilization: 80
`;
        setHpaYamlEditor(boilerplate);
        setEditingHpa(true);
    };

    const generateVpaBoilerplate = () => {
        let targetApiVersion = 'apps/v1';
        let targetKind = 'Deployment';
        if (item.type === 'statefulsets') targetKind = 'StatefulSet';
        if (item.type === 'daemonsets') targetKind = 'DaemonSet';

        const boilerplate = `apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: ${resName}-vpa
  namespace: ${resNs || namespace}
spec:
  targetRef:
    apiVersion: ${targetApiVersion}
    kind: ${targetKind}
    name: ${resName}
  updatePolicy:
    # Use "Off" for recommendations only. 
    # Use "Auto" to actively restart pods with new limits.
    # WARNING: Do not use "Auto" on CPU if HPA is already scaling on CPU!
    updateMode: "Off"
  resourcePolicy:
    containerPolicies:
      - containerName: "*"
        minAllowed:
          cpu: "100m"
          memory: "128Mi"
        maxAllowed:
          cpu: "2"
          memory: "2Gi"
`;
        setVpaYamlEditor(boilerplate);
        setEditingVpa(true);
    };

    const handleApplyHpa = async () => {
        setApplyingHpa(true);
        try {
            await onApplyManifest(hpaYamlEditor);
            setEditingHpa(false);
            addToast('HPA applied successfully', 'success');
            setLoadingAutoscalers(true);
            const data = await apiClient.getKubernetesAutoscalers(resNs || namespace, item.type, resName);
            setAutoscalers(data);
        } catch (err: any) { addToast(`Apply failed: ${err.message}`, 'error'); } 
        finally { setApplyingHpa(false); setLoadingAutoscalers(false); }
    };

    const handleApplyVpa = async () => {
        setApplyingVpa(true);
        try {
            await onApplyManifest(vpaYamlEditor);
            setEditingVpa(false);
            addToast('VPA applied successfully', 'success');
            setLoadingAutoscalers(true);
            const data = await apiClient.getKubernetesAutoscalers(resNs || namespace, item.type, resName);
            setAutoscalers(data);
        } catch (err: any) { addToast(`Apply failed: ${err.message}`, 'error'); } 
        finally { setApplyingVpa(false); setLoadingAutoscalers(false); }
    };

    const handleDeleteHpa = async () => {
        if (!hpaToDelete) return;
        try {
            await apiClient.deleteKubernetesResource(resNs || namespace, 'horizontalpodautoscalers', hpaToDelete);
            addToast('HPA deleted successfully', 'success');
            setLoadingAutoscalers(true);
            const data = await apiClient.getKubernetesAutoscalers(resNs || namespace, item.type, resName);
            setAutoscalers(data);
        } catch (err: any) { addToast(`Delete failed: ${err.message}`, 'error'); }
        finally { 
            setLoadingAutoscalers(false); 
            setHpaToDelete(null);
        }
    };

    const handleDeleteVpa = async () => {
        if (!vpaToDelete) return;
        try {
            await apiClient.deleteKubernetesResource(resNs || namespace, 'verticalpodautoscalers', vpaToDelete);
            addToast('VPA deleted successfully', 'success');
            setLoadingAutoscalers(true);
            const data = await apiClient.getKubernetesAutoscalers(resNs || namespace, item.type, resName);
            setAutoscalers(data);
        } catch (err: any) { addToast(`Delete failed: ${err.message}`, 'error'); }
        finally { 
            setLoadingAutoscalers(false); 
            setVpaToDelete(null);
        }
    };

    return (
        <div className="p-4 h-full flex flex-col min-h-0 overflow-y-auto custom-scrollbar">
            <div className="flex items-center gap-3 mb-6 bg-black/20 p-3 rounded-lg border border-gray-800">
                <TrendingUp className="w-5 h-5 text-primary" />
                <div>
                    <h3 className="text-sm font-bold text-gray-200">Autoscaling Configuration</h3>
                    <p className="text-xs text-gray-500">Horizontal and Vertical Pod Autoscalers targeting this resource</p>
                </div>
            </div>
            
            {loadingAutoscalers ? (
                <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
            ) : autoscalers ? (
                <div className="space-y-6">
                    {/* HPA Section */}
                    <div className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800 shadow-inner">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <Maximize2 className="w-4 h-4 text-primary" />
                                Horizontal Pod Autoscaler
                            </h4>
                            {!editingHpa && (
                                <div className="flex items-center space-x-2">
                                    {autoscalers.hpa.length > 0 ? (
                                        <>
                                            <button
                                                onClick={() => setHpaToDelete(autoscalers.hpa[0].metadata.name)}
                                                className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                            >
                                                <Trash className="w-3 h-3" /> Delete
                                            </button>
                                            <button
                                                onClick={() => loadHpaYaml(autoscalers.hpa[0])}
                                                className="text-xs bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                            >
                                                <Code className="w-3 h-3" /> Edit YAML
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={generateHpaBoilerplate}
                                            className="text-xs bg-primary/20 hover:bg-primary/30 text-primary px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                        >
                                            <Plus className="w-3 h-3" /> Create HPA
                                        </button>
                                    )}
                                </div>
                            )}
                            {editingHpa && (
                                <button onClick={() => setEditingHpa(false)} className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors">
                                    <X className="w-3 h-3" /> Cancel
                                </button>
                            )}
                        </div>

                        {editingHpa ? (
                            <div className="flex flex-col gap-3">
                                <div className="h-64 border border-gray-800 rounded-lg overflow-hidden">
                                    <Editor
                                        height="100%"
                                        language="yaml"
                                        theme="vs-dark"
                                        value={hpaYamlEditor}
                                        onChange={(val) => setHpaYamlEditor(val || '')}
                                        options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false }}
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <button onClick={handleApplyHpa} disabled={applyingHpa} className="bg-primary hover:bg-primary/90 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2">
                                        {applyingHpa ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black" /> : <Save className="w-4 h-4" />}
                                        Apply HPA
                                    </button>
                                </div>
                            </div>
                        ) : autoscalers.hpa.length > 0 ? (
                            autoscalers.hpa.map((hpa, idx) => (
                                <div key={idx} className="bg-black/20 p-3 rounded-lg border border-gray-800 mb-3 last:mb-0">
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="font-mono text-sm text-primary">{hpa.metadata?.name}</span>
                                        <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                                            Current: {hpa.status?.currentReplicas || 0} / Desired: {hpa.status?.desiredReplicas || 0}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div><span className="text-gray-500 block text-xs">Min Replicas</span><span className="text-gray-200">{hpa.spec?.minReplicas || 1}</span></div>
                                        <div><span className="text-gray-500 block text-xs">Max Replicas</span><span className="text-gray-200">{hpa.spec?.maxReplicas}</span></div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-sm text-gray-500 py-4 text-center border border-dashed border-gray-800 rounded-lg">
                                No HPA found targeting this resource.
                            </div>
                        )}
                    </div>

                    {/* VPA Section */}
                    <div className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800 shadow-inner">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                <Activity className="w-4 h-4 text-blue-400" />
                                Vertical Pod Autoscaler
                            </h4>
                            {!editingVpa && (
                                <div className="flex items-center space-x-2">
                                    {autoscalers.vpa.length > 0 ? (
                                        <>
                                            <button
                                                onClick={() => setVpaToDelete(autoscalers.vpa[0].metadata.name)}
                                                className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                            >
                                                <Trash className="w-3 h-3" /> Delete
                                            </button>
                                            <button
                                                onClick={() => loadVpaYaml(autoscalers.vpa[0])}
                                                className="text-xs bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                            >
                                                <Code className="w-3 h-3" /> Edit YAML
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={generateVpaBoilerplate}
                                            className="text-xs bg-blue-400/20 hover:bg-blue-400/30 text-blue-400 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                        >
                                            <Plus className="w-3 h-3" /> Create VPA
                                        </button>
                                    )}
                                </div>
                            )}
                            {editingVpa && (
                                <button onClick={() => setEditingVpa(false)} className="text-xs text-gray-400 hover:text-white flex items-center gap-1 transition-colors">
                                    <X className="w-3 h-3" /> Cancel
                                </button>
                            )}
                        </div>

                        {editingVpa ? (
                            <div className="flex flex-col gap-3">
                                <div className="h-64 border border-gray-800 rounded-lg overflow-hidden">
                                    <Editor
                                        height="100%"
                                        language="yaml"
                                        theme="vs-dark"
                                        value={vpaYamlEditor}
                                        onChange={(val) => setVpaYamlEditor(val || '')}
                                        options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false }}
                                    />
                                </div>
                                <div className="flex justify-end">
                                    <button onClick={handleApplyVpa} disabled={applyingVpa} className="bg-blue-500 hover:bg-blue-400 text-black font-semibold px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2">
                                        {applyingVpa ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black" /> : <Save className="w-4 h-4" />}
                                        Apply VPA
                                    </button>
                                </div>
                            </div>
                        ) : autoscalers.vpa.length > 0 ? (
                            autoscalers.vpa.map((vpa, idx) => (
                                <div key={idx} className="bg-black/20 p-3 rounded-lg border border-gray-800 mb-3 last:mb-0">
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="font-mono text-sm text-blue-400">{vpa.metadata?.name}</span>
                                        <span className="text-xs bg-blue-400/20 text-blue-400 px-2 py-1 rounded capitalize">
                                            Mode: {vpa.spec?.updatePolicy?.updateMode || 'Auto'}
                                        </span>
                                    </div>
                                    {vpa.status?.recommendation?.containerRecommendations ? (
                                        <div className="space-y-3">
                                            {vpa.status.recommendation.containerRecommendations.map((rec: any, cidx: number) => (
                                                <div key={cidx} className="bg-black/40 p-2 rounded border border-gray-800/50">
                                                    <div className="text-xs font-semibold text-gray-300 mb-2">Container: {rec.containerName}</div>
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                                        <div><span className="text-gray-500 block">Target CPU</span><span className="text-gray-200">{rec.target?.cpu || '-'}</span></div>
                                                        <div><span className="text-gray-500 block">Target Mem</span><span className="text-gray-200">{rec.target?.memory || '-'}</span></div>
                                                        <div><span className="text-gray-500 block">Uncapped CPU</span><span className="text-gray-200">{rec.uncappedTarget?.cpu || '-'}</span></div>
                                                        <div><span className="text-gray-500 block">Uncapped Mem</span><span className="text-gray-200">{rec.uncappedTarget?.memory || '-'}</span></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-gray-500 italic">No recommendations available yet.</div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="text-sm text-gray-500 py-4 text-center border border-dashed border-gray-800 rounded-lg">
                                No VPA found targeting this resource.
                            </div>
                        )}
                    </div>
                </div>
            ) : null}

            <K8sConfirmModal 
                isOpen={!!hpaToDelete}
                onClose={() => setHpaToDelete(null)}
                onConfirm={handleDeleteHpa}
                title={`Delete HPA?`}
                message={`Are you sure you want to delete "${hpaToDelete}"? This action cannot be undone.`}
                confirmText="Delete HPA"
                variant="danger"
            />

            <K8sConfirmModal 
                isOpen={!!vpaToDelete}
                onClose={() => setVpaToDelete(null)}
                onConfirm={handleDeleteVpa}
                title={`Delete VPA?`}
                message={`Are you sure you want to delete "${vpaToDelete}"? This action cannot be undone.`}
                confirmText="Delete VPA"
                variant="danger"
            />
        </div>
    );
};
