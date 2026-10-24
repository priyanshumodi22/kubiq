// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { K8sDetailPanel } from './K8sDetailPanel';

const mocks = vi.hoisted(() => ({ status: vi.fn(), history: vi.fn(), yaml: vi.fn(), canExec: false }));
vi.mock('../services/api', () => ({ apiClient: { getKubernetesStatus: mocks.status, getKubernetesPodMetricsHistory: mocks.history, getKubernetesResourceYaml: mocks.yaml } }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => mocks.canExec }) }));
vi.mock('./K8sLogViewer', () => ({ K8sLogViewer: () => <div>Pod logs</div> }));
vi.mock('./K8sTerminal', () => ({ default: () => <div>Pod terminal</div> }));
vi.mock('./AiStatusOrb', () => ({ AiStatusOrb: () => null }));
vi.mock('./K8sAiDiagnosticModal', () => ({ K8sAiDiagnosticModal: () => null }));

const pod = { type: 'pods', data: { name: 'api', namespace: 'apps', nodeName: 'node-a', containers: [{ name: 'web', image: 'registry.example.test/team/web:v2', state: 'running', ready: true, restartCount: 0 }], conditions: [] } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.canExec = false;
  mocks.status.mockResolvedValue({ clickhouseEnabled: false, scrapeInterval: 60 });
  mocks.history.mockResolvedValue([]);
  mocks.yaml.mockResolvedValue({ apiVersion: 'v1', kind: 'Pod', metadata: { name: 'api' } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('Kubernetes detail panel compatibility', () => {
  it('renders no inspector or resource requests when selection is cleared', () => {
    const view = render(<K8sDetailPanel item={null} namespace="apps" onClose={vi.fn()} />);
    expect(view.container.innerHTML).toBe('');
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.yaml).not.toHaveBeenCalled();
  });

  it('renders raw metadata labels and condition text without requiring pod-only fields', () => {
    const view = render(<K8sDetailPanel item={{ type: 'nodes', data: { metadata: { name: 'raw-node', namespace: 'apps', labels: { app: 'fixture-label' } }, conditions: [{ type: 'Ready', status: 'True', reason: '—', message: 'Fixture ready' }] } }} namespace="apps" onClose={vi.fn()} />);
    expect(view.getByText('raw-node')).toBeTruthy();
    expect(view.getByText(/fixture-label/)).toBeTruthy();
    expect(view.getByText('Status Info')).toBeTruthy();
    expect(view.getByText('Fixture ready')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Terminal' })).toBeNull();
  });

  it('hides terminal without exec permission and preserves log navigation', async () => {
    const view = render(<K8sDetailPanel item={pod} namespace="apps" onClose={vi.fn()} />);
    expect(view.queryByRole('button', { name: 'Terminal' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Logs' }));
    expect(view.getByText('Pod logs')).toBeTruthy();
  });

  it('loads namespaced YAML and renders its content', async () => {
    const view = render(<K8sDetailPanel item={pod} namespace="apps" onClose={vi.fn()} />);
    fireEvent.click(view.getByRole('button', { name: 'JSON / YAML' }));
    await waitFor(() => expect(view.getByText(/apiVersion: v1/)).toBeTruthy());
    expect(mocks.yaml).toHaveBeenCalledWith('apps', 'pods', 'api');
  });

  it('uses the cluster-scoped namespace sentinel for nodes', async () => {
    const view = render(<K8sDetailPanel item={{ type: 'nodes', data: { name: 'node-a' } }} namespace="apps" onClose={vi.fn()} />);
    fireEvent.click(view.getByRole('button', { name: 'JSON / YAML' }));
    await waitFor(() => expect(mocks.yaml).toHaveBeenCalledWith('-', 'nodes', 'node-a'));
  });

  it('closes on Escape and removes its listener on unmount', () => {
    const close = vi.fn();
    const view = render(<K8sDetailPanel item={pod} namespace="apps" onClose={close} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
    view.unmount();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('does not start a history poll when configuration arrives after unmount', async () => {
    vi.useFakeTimers();
    let resolveStatus!: (value: { clickhouseEnabled: boolean; scrapeInterval: number }) => void;
    mocks.status.mockReturnValue(new Promise(resolve => { resolveStatus = resolve; }));
    const view = render(<K8sDetailPanel item={pod} namespace="apps" onClose={vi.fn()} />);
    view.unmount();
    await act(async () => { resolveStatus({ clickhouseEnabled: true, scrapeInterval: 60 }); });
    await act(async () => { vi.advanceTimersByTime(120000); });
    expect(mocks.history).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retains expansion by container identity when containers reorder', () => {
    const worker = { ...pod.data.containers[0], name: 'worker', image: 'worker:v1' };
    const view = render(<K8sDetailPanel item={{ ...pod, data: { ...pod.data, containers: [...pod.data.containers, worker] } }} namespace="apps" onClose={vi.fn()} />);
    fireEvent.click(view.getByRole('button', { name: 'Inspect container web' }));
    view.rerender(<K8sDetailPanel item={{ ...pod, data: { ...pod.data, containers: [worker, ...pod.data.containers] } }} namespace="apps" onClose={vi.fn()} />);
    expect(view.getByRole('button', { name: 'Inspect container web' }).getAttribute('aria-expanded')).toBe('true');
    expect(view.getByRole('button', { name: 'Inspect container worker' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('ignores stale YAML responses after switching resources', async () => {
    let resolveFirst!: (value: object) => void;
    mocks.yaml.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; })).mockResolvedValue({ kind: 'Node', metadata: { name: 'node-b' } });
    const view = render(<K8sDetailPanel item={pod} namespace="apps" onClose={vi.fn()} />);
    fireEvent.click(view.getByRole('button', { name: 'JSON / YAML' }));
    view.rerender(<K8sDetailPanel item={{ type: 'nodes', data: { name: 'node-b' } }} namespace="apps" onClose={vi.fn()} />);
    await waitFor(() => expect(view.getByText(/kind: Node/)).toBeTruthy());
    await act(async () => { resolveFirst({ kind: 'Pod', metadata: { name: 'stale-pod' } }); });
    expect(view.getByText(/kind: Node/)).toBeTruthy();
    expect(view.queryByText(/stale-pod/)).toBeNull();
  });

  it('falls back to live metrics after a configuration request fails', async () => {
    mocks.status.mockRejectedValue(new Error('configuration unavailable'));
    const view = render(<K8sDetailPanel item={pod} namespace="apps" onClose={vi.fn()} />);
    await waitFor(() => expect(view.getByText('Synchronizing live APM stream...')).toBeTruthy());
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it('unmounts an active terminal when exec permission is revoked', () => {
    mocks.canExec = true;
    const view = render(<K8sDetailPanel item={pod} namespace="apps" onClose={vi.fn()} />);
    fireEvent.click(view.getByRole('button', { name: 'Terminal' }));
    expect(view.getByText('Pod terminal')).toBeTruthy();
    mocks.canExec = false;
    view.rerender(<K8sDetailPanel item={pod} namespace="apps" onClose={vi.fn()} />);
    expect(view.queryByText('Pod terminal')).toBeNull();
  });
});
