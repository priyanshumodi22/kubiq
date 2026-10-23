import { describe, expect, it } from 'vitest';
import { exportNodeColors, podCardColor, relationshipCardClass, relationshipEdges, relationshipStatus, type RelationshipNode, type RelationshipResource } from './k8sRelationshipData';

const node = (id: string, type: string, data: RelationshipResource): RelationshipNode => ({ id, type, name: data.name || data.metadata?.name, x: 10, y: 20, data });

describe('Kubernetes relationship compatibility', () => {
    it('preserves edge order, deduplicates ingress targets and requires every selector label', () => {
        const ingress = { metadata: { name: 'public' }, spec: { rules: [{ http: { paths: [{ backend: { service: { name: 'api' } } }, { backend: { service: { name: 'api' } } }] } }], defaultBackend: { service: { name: 'api' } } } };
        const service = { metadata: { name: 'api' }, spec: { selector: { app: 'api', tier: 'backend' } } };
        const pod = { name: 'api-1', labels: { app: 'api', tier: 'backend' }, refConfigMaps: ['config', 'missing'], refSecrets: ['credentials'] };
        const other = { name: 'other', labels: { app: 'api' } };
        const nodes = [node('ingress-public', 'ingresses', ingress), node('service-api', 'services', service), node('pod-api-1', 'pods', pod), node('pod-other', 'pods', other), node('configmap-config', 'configmaps', {}), node('secret-credentials', 'secrets', {})];
        expect(relationshipEdges([ingress], [service], [pod, other], nodes).map(edge => edge.id)).toEqual(['edge-ing-svc-public-api', 'edge-svc-pod-api-api-1', 'edge-pod-cm-api-1-config', 'edge-pod-sec-api-1-credentials']);
        expect(relationshipEdges([], [{ metadata: { name: 'api' }, spec: { selector: {} } }], [pod], nodes)).toEqual([expect.objectContaining({ id: 'edge-pod-cm-api-1-config' }), expect.objectContaining({ id: 'edge-pod-sec-api-1-credentials' })]);
    });

    it('handles string and object pod statuses consistently in live and exported colors', () => {
        const running = node('pod-api', 'pods', { name: 'api', status: { phase: 'Running' } });
        expect(relationshipStatus(running)).toBe('Running');
        expect(podCardColor(running)).toContain('emerald');
        expect(exportNodeColors(running).statusDotColor).toBe('#4ade80');
        expect(relationshipStatus(node('pod-ready', 'pods', { ready: true }))).toBe('Running');
        expect(relationshipStatus(node('pod-unknown', 'pods', {}))).toBe('Active');
        expect(podCardColor(node('pod-pending', 'pods', { status: 'Pending' }))).toContain('amber');
        expect(podCardColor(node('pod-failed', 'pods', { status: 'Failed' }))).toContain('red');
    });

    it('preserves hover precedence over filtering and disconnected dimming', () => {
        expect(relationshipCardClass(true, false, true, 'status')).toContain('border-primary');
        expect(relationshipCardClass(false, true, false, 'status')).toContain('status text-gray-100');
        expect(relationshipCardClass(false, true, true, 'status')).toContain('opacity-25');
    });
});
