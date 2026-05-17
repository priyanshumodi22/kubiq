import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';

export interface KubeContainer {
    name: string;
    image: string;
    ready: boolean;
    restartCount: number;
    state: 'running' | 'waiting' | 'terminated' | 'unknown';
    stateReason?: string;
}

export interface KubeCondition {
    type: string;
    status: string;
    reason: string;
    message: string;
}

export interface KubePod {
    name: string;
    namespace: string;
    status: string;
    restarts: number;
    ready: boolean;
    readyCount: number;
    totalContainers: number;
    podIP: string;
    nodeName: string;
    startTime: string | null;
    lastTerminationReason?: string;
    labels: Record<string, string>;
    containers: KubeContainer[];
    conditions: KubeCondition[];
    refConfigMaps?: string[];
    refSecrets?: string[];
}

export interface KubeMetric {
    name: string;
    namespace: string;
    containers: { name: string; cpu: string; memory: string }[];
}

export interface KubeEvent {
    name: string;
    type: string;
    reason: string;
    message: string;
    involvedObject: string;
    involvedKind: string;
    count: number;
    lastTimestamp: string | null;
}

export interface KubeDeployment {
    name: string;
    namespace: string;
    replicas: number;
    readyReplicas: number;
    availableReplicas: number;
    strategy: string;
    labels: Record<string, string>;
    conditions: KubeCondition[];
}

export function useKubernetes() {
    const [available, setAvailable] = useState<boolean | null>(null);
    const [context, setContext] = useState<string>('');
    const [contexts, setContexts] = useState<any[]>([]);
    const [namespaces, setNamespaces] = useState<string[]>([]);
    const [selectedNamespace, setSelectedNamespace] = useState<string>('');
    const [pods, setPods] = useState<KubePod[]>([]);
    const [metrics, setMetrics] = useState<KubeMetric[]>([]);
    const [events, setEvents] = useState<KubeEvent[]>([]);
    const [deployments, setDeployments] = useState<KubeDeployment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        apiClient.getKubernetesStatus()
            .then(data => {
                setAvailable(data.available);
                setContext(data.context || '');
                if (data.available) {
                    fetchNamespaces();
                    fetchContexts();
                }
            })
            .catch(() => setAvailable(false));
    }, []);

    const fetchNamespaces = async () => {
        try {
            const data: string[] = await apiClient.getKubernetesNamespaces();
            setNamespaces(data);
            if (data.length > 0) setSelectedNamespace(data[0]);
        } catch (e: any) { setError(e.message); }
    };

    const fetchContexts = async () => {
        try {
            const data = await apiClient.getKubernetesContexts();
            setContexts(data.contexts || []);
        } catch (e) {}
    };

    const switchContext = async (contextName: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiClient.switchKubernetesContext(contextName);
            setAvailable(res.available);
            setContext(res.context || '');
            if (res.available) {
                // Fetch namespaces and reset list
                const nsData: string[] = await apiClient.getKubernetesNamespaces();
                setNamespaces(nsData);
                if (nsData.length > 0) {
                    setSelectedNamespace(nsData[0]);
                } else {
                    setSelectedNamespace('');
                }
                // Reload contexts lists
                await fetchContexts();
            } else {
                setNamespaces([]);
                setSelectedNamespace('');
                setPods([]);
                setMetrics([]);
                setEvents([]);
                setDeployments([]);
            }
        } catch (e: any) { 
            setError(e.message); 
        } finally { 
            setLoading(false); 
        }
    };

    const fetchNamespaceData = useCallback(async (ns: string) => {
        if (!ns) return;
        setLoading(true);
        setError(null);
        try {
            const [p, m, ev, d] = await Promise.all([
                apiClient.getKubernetesPods(ns),
                apiClient.getKubernetesMetrics(ns),
                apiClient.getKubernetesEvents(ns),
                apiClient.getKubernetesDeployments(ns),
            ]);
            setPods(p); setMetrics(m); setEvents(ev); setDeployments(d);
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    }, []);

    const refresh = useCallback(() => {
        if (selectedNamespace) fetchNamespaceData(selectedNamespace);
    }, [selectedNamespace, fetchNamespaceData]);

    // Note: Auto-refresh is managed by the consuming component (e.g. KubernetesDashboard)
    // to avoid duplicate API calls when multiple components use this hook.


    const scaleDeployment = async (name: string, replicas: number) => {
        if (!selectedNamespace) return;
        try {
            await apiClient.scaleKubernetesDeployment(selectedNamespace, name, replicas);
            refresh();
        } catch (e: any) { setError(e.message); throw e; }
    };

    const restartDeployment = async (name: string) => {
        if (!selectedNamespace) return;
        try {
            await apiClient.restartKubernetesDeployment(selectedNamespace, name);
            refresh();
        } catch (e: any) { setError(e.message); throw e; }
    };

    const deleteResource = async (type: string, name: string) => {
        if (!selectedNamespace) return;
        try {
            await apiClient.deleteKubernetesResource(selectedNamespace, type, name);
            refresh();
        } catch (e: any) { setError(e.message); throw e; }
    };

    return {
        available, context, contexts, switchContext, namespaces, selectedNamespace, setSelectedNamespace,
        pods, metrics, events, deployments, loading, error,
        refresh,
        scaleDeployment, restartDeployment, deleteResource,
    };

}
