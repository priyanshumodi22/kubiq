import { useState, useEffect, useCallback } from 'react';

export interface KubePod {
    name: string;
    namespace: string;
    status: string;
    restarts: number;
    ready: boolean;
    podIP: string;
    nodeName: string;
    startTime: string | null;
    lastTerminationReason?: string;
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
    count: number;
    lastTimestamp: string | null;
}

export interface KubeDeployment {
    name: string;
    namespace: string;
    replicas: number;
    readyReplicas: number;
    availableReplicas: number;
}

export function useKubernetes() {
    const baseUrl = import.meta.env.VITE_API_URL || '';
    const ctxPath = import.meta.env.VITE_BACKEND_CONTEXT_PATH || '';
    const api = `${baseUrl}${ctxPath}/api/kubernetes`;

    const [available, setAvailable] = useState<boolean | null>(null);
    const [context, setContext] = useState<string>('');
    const [namespaces, setNamespaces] = useState<string[]>([]);
    const [selectedNamespace, setSelectedNamespace] = useState<string>('');
    const [pods, setPods] = useState<KubePod[]>([]);
    const [metrics, setMetrics] = useState<KubeMetric[]>([]);
    const [events, setEvents] = useState<KubeEvent[]>([]);
    const [deployments, setDeployments] = useState<KubeDeployment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Check availability on mount
    useEffect(() => {
        fetch(`${api}/status`, { credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                setAvailable(data.available);
                setContext(data.context || '');
                if (data.available) fetchNamespaces();
            })
            .catch(() => setAvailable(false));
    }, []);

    const fetchNamespaces = async () => {
        try {
            const res = await fetch(`${api}/namespaces`, { credentials: 'include' });
            const data: string[] = await res.json();
            setNamespaces(data);
            if (data.length > 0) setSelectedNamespace(data[0]);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const fetchNamespaceData = useCallback(async (ns: string) => {
        if (!ns) return;
        setLoading(true);
        setError(null);
        try {
            const [podsRes, metricsRes, eventsRes, depRes] = await Promise.all([
                fetch(`${api}/namespaces/${ns}/pods`, { credentials: 'include' }),
                fetch(`${api}/namespaces/${ns}/metrics`, { credentials: 'include' }),
                fetch(`${api}/namespaces/${ns}/events`, { credentials: 'include' }),
                fetch(`${api}/namespaces/${ns}/deployments`, { credentials: 'include' }),
            ]);
            setPods(await podsRes.json());
            setMetrics(await metricsRes.json());
            setEvents(await eventsRes.json());
            setDeployments(await depRes.json());
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        if (selectedNamespace) fetchNamespaceData(selectedNamespace);
    }, [selectedNamespace, fetchNamespaceData]);

    return {
        available,
        context,
        namespaces,
        selectedNamespace,
        setSelectedNamespace,
        pods,
        metrics,
        events,
        deployments,
        loading,
        error,
        refresh: () => fetchNamespaceData(selectedNamespace),
    };
}
