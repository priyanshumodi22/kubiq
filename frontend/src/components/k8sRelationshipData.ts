export interface RelationshipResource {
    name?: string;
    metadata?: { name?: string };
    labels?: Record<string, string>;
    ready?: boolean;
    status?: string | { phase?: string };
    refConfigMaps?: string[];
    refSecrets?: string[];
    spec?: {
        selector?: Record<string, string>;
        rules?: Array<{ host?: string; http?: { paths?: Array<{ backend?: { service?: { name?: string } } }> } }>;
        defaultBackend?: { service?: { name?: string } };
    };
}

export interface RelationshipNode {
    id: string;
    type: string;
    name?: string;
    x: number;
    y: number;
    data: RelationshipResource;
}

export interface RelationshipEdge {
    id: string;
    sourceId: string;
    targetId: string;
    source: RelationshipNode;
    target: RelationshipNode;
}

type EdgeContext = { edges: RelationshipEdge[]; nodes: Map<string, RelationshipNode> };

function addEdge(context: EdgeContext, id: string, sourceId: string, targetId: string) {
    const source = context.nodes.get(sourceId);
    const target = context.nodes.get(targetId);
    if (source && target) context.edges.push({ id, sourceId, targetId, source, target });
}

function ingressEdges(context: EdgeContext, ingresses: RelationshipResource[]) {
    for (const ingress of ingresses) {
        const name = ingress.metadata?.name;
        const targets = new Set<string>();
        for (const rule of ingress.spec?.rules || []) {
            for (const path of rule.http?.paths || []) {
                const target = path.backend?.service?.name;
                if (target) targets.add(target);
            }
        }
        const defaultTarget = ingress.spec?.defaultBackend?.service?.name;
        if (defaultTarget) targets.add(defaultTarget);
        for (const target of targets) addEdge(context, `edge-ing-svc-${name}-${target}`, `ingress-${name}`, `service-${target}`);
    }
}

function serviceEdges(context: EdgeContext, services: RelationshipResource[], pods: RelationshipResource[]) {
    for (const service of services) {
        const name = service.metadata?.name;
        const selector = service.spec?.selector;
        if (!selector || Object.keys(selector).length === 0) continue;
        for (const pod of pods) {
            const labels = pod.labels || {};
            if (Object.entries(selector).every(([key, value]) => labels[key] === value)) {
                addEdge(context, `edge-svc-pod-${name}-${pod.name}`, `service-${name}`, `pod-${pod.name}`);
            }
        }
    }
}

function podReferenceEdges(context: EdgeContext, pods: RelationshipResource[]) {
    for (const pod of pods) {
        for (const name of pod.refConfigMaps || []) addEdge(context, `edge-pod-cm-${pod.name}-${name}`, `pod-${pod.name}`, `configmap-${name}`);
        for (const name of pod.refSecrets || []) addEdge(context, `edge-pod-sec-${pod.name}-${name}`, `pod-${pod.name}`, `secret-${name}`);
    }
}

export function relationshipEdges(ingresses: RelationshipResource[], services: RelationshipResource[], pods: RelationshipResource[], nodes: RelationshipNode[]) {
    const index = new Map<string, RelationshipNode>();
    for (const node of nodes) if (!index.has(node.id)) index.set(node.id, node);
    const context: EdgeContext = { edges: [], nodes: index };
    ingressEdges(context, ingresses);
    serviceEdges(context, services, pods);
    podReferenceEdges(context, pods);
    return context.edges;
}

export function relationshipStatus(node: RelationshipNode): string {
    if (node.type === 'pods') {
        if (typeof node.data.status === 'string') return node.data.status;
        if (typeof node.data.status?.phase === 'string') return node.data.status.phase;
        return node.data.ready ? 'Running' : 'Active';
    }
    if (node.type === 'ingresses') return node.data.spec?.rules?.[0]?.host || 'Local Route';
    return node.type.charAt(0).toUpperCase() + node.type.slice(1);
}

export function podCardColor(node: RelationshipNode): string {
    if (node.type !== 'pods') return 'border-gray-800 bg-[#161616]';
    const status = relationshipStatus(node).toLowerCase();
    if (status.includes('running') || node.data.ready) return 'border-emerald-500/30 bg-emerald-950/15';
    if (status.includes('pending')) return 'border-amber-500/30 bg-amber-950/15';
    return 'border-red-500/30 bg-red-950/15';
}

export function relationshipCardClass(hovered: boolean, connected: boolean, filtered: boolean, color: string): string {
    if (hovered) return 'border-primary bg-primary/10 shadow-primary/20 scale-[1.02]';
    if (connected && !filtered) return `${color} text-gray-100 hover:border-gray-600`;
    return 'border-gray-900/60 bg-[#141414]/30 text-gray-500 opacity-25';
}

export function exportNodeColors(node: RelationshipNode) {
    if (node.type !== 'pods') {
        const dots: Record<string, string> = { ingresses: '#22d3ee', services: '#34d399', configmaps: '#fbbf24', secrets: '#f87171' };
        return { cardBg: '#161616', cardStroke: '#262626', statusDotColor: dots[node.type] || '#3b82f6' };
    }
    const status = relationshipStatus(node).toLowerCase();
    if (status.includes('running') || node.data.ready) return { cardBg: '#091b12', cardStroke: 'rgba(16, 185, 129, 0.4)', statusDotColor: '#4ade80' };
    if (status.includes('pending')) return { cardBg: '#1f1609', cardStroke: 'rgba(245, 158, 11, 0.4)', statusDotColor: '#fbbf24' };
    return { cardBg: '#220b0b', cardStroke: 'rgba(239, 68, 68, 0.4)', statusDotColor: '#f87171' };
}
