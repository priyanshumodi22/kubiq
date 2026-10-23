// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { K8sRelationshipMap } from './K8sRelationshipMap';

const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
    else Reflect.deleteProperty(URL, 'createObjectURL');
    if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
    else Reflect.deleteProperty(URL, 'revokeObjectURL');
});

const pod = { name: 'api', status: { phase: 'Running' }, ready: true, labels: { app: 'api' } };
const props = { namespace: 'apps', pods: [pod], services: [{ metadata: { name: 'api' }, spec: { selector: { app: 'api' } } }], ingresses: [], configMaps: [], secrets: [], onSelectItem: vi.fn() };

describe('Kubernetes topology controls', () => {
    it('renders object-shaped pod statuses and retains raw selection payloads', () => {
        const select = vi.fn();
        const view = render(<K8sRelationshipMap {...props} onSelectItem={select} />);
        const button = view.getByRole('button', { name: 'Inspect pods api' });
        expect(button.tabIndex).toBe(0);
        expect(view.getByText('Running')).toBeTruthy();
        fireEvent.focus(button);
        expect(button.className).toContain('border-primary');
        fireEvent.click(button);
        expect(select).toHaveBeenCalledWith({ type: 'pods', data: pod });
        fireEvent.change(view.getByRole('textbox', { name: 'Filter topology nodes' }), { target: { value: 'missing' } });
        fireEvent.blur(button);
        expect(button.className).toContain('opacity-25');
    });

    it('supports canvas keyboard pan, zoom and reset without consuming child keys', () => {
        const view = render(<K8sRelationshipMap {...props} />);
        const canvas = view.getByRole('button', { name: /^Kubernetes topology canvas/ });
        const graph = () => view.container.querySelector<HTMLDivElement>('div[style*="scale("]')!;
        fireEvent.keyDown(canvas, { key: 'ArrowRight' });
        fireEvent.keyDown(canvas, { key: 'ArrowDown' });
        expect(graph().style.transform).toContain('translate(30px, 30px)');
        fireEvent.keyDown(view.getByRole('button', { name: 'Inspect pods api' }), { key: 'ArrowRight' });
        expect(graph().style.transform).toContain('translate(30px, 30px)');
        fireEvent.keyDown(canvas, { key: '+' });
        expect(view.getByText('110%')).toBeTruthy();
        fireEvent.keyDown(canvas, { key: 'Home' });
        expect(graph().style.transform).toBe('translate(0px, 0px) scale(1)');
        fireEvent.mouseDown(canvas, { clientX: 10, clientY: 20 });
        fireEvent.mouseMove(canvas, { clientX: 30, clientY: 50 });
        fireEvent.mouseUp(canvas);
        expect(graph().style.transform).toBe('translate(20px, 30px) scale(1)');
    });

    it('exports parseable SVG with escaped resource text and releases its object URL', async () => {
        let captured!: Blob;
        const create = vi.fn((blob: Blob) => { captured = blob; return 'blob:topology-test'; });
        const revoke = vi.fn();
        Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true });
        Object.defineProperty(URL, 'revokeObjectURL', { value: revoke, configurable: true });
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const view = render(<K8sRelationshipMap {...props} namespace={'apps<script>&"'} pods={[{ name: 'pod<script>&"', status: { phase: 'Pending' }, ready: false }]} services={[]} />);
        fireEvent.click(view.getByRole('button', { name: 'Export SVG' }));
        const svg = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(captured); });
        const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
        expect(parsed.querySelector('parsererror')).toBeNull();
        expect(parsed.querySelector('script')).toBeNull();
        expect(svg).toContain('apps&lt;script&gt;&amp;&quot;');
        expect(parsed.querySelectorAll('rect[width="190"]')).toHaveLength(1);
        expect(revoke).toHaveBeenCalledWith('blob:topology-test');
    });
});
