// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { K8sNamespaceOverview } from './K8sNamespaceOverview';

const mocks = vi.hoisted(() => ({ quotas: vi.fn() }));
vi.mock('../services/api', () => ({ apiClient: { getKubernetesQuotas: mocks.quotas } }));
vi.mock('./AiStatusOrb', () => ({ AiStatusOrb: () => null }));
vi.mock('./K8sAiDiagnosticModal', () => ({ K8sAiDiagnosticModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>Diagnostic opened</div> : null }));
afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); mocks.quotas.mockResolvedValue({ quotas: [], limitRanges: [] }); });

const event = { name: 'pod-warning.123', type: 'Warning', reason: 'BackOff', message: 'Retrying', involvedObject: 'api', involvedKind: 'Pod', count: 2, lastTimestamp: null };
const data = { pods: [], deployments: [], services: [], configMaps: [], secrets: [], events: [event], metrics: [] };

describe('namespace navigation controls', () => {
  it('preserves health counts and metric units across multiple containers', async () => {
    const view = render(<K8sNamespaceOverview selectedNamespace="apps" data={{ ...data,
      pods: [{ namespace: 'apps', status: 'Running' }, { namespace: 'apps', status: 'Running', isTerminating: true }, { namespace: 'apps', status: 'CrashLoopBackOff' }, { namespace: 'apps', status: 'Pending' }],
      deployments: [{ namespace: 'apps', replicas: 2, readyReplicas: 1 }],
      metrics: [{ name: 'api', namespace: 'apps', containers: [{ name: 'a', cpu: '123000000n', memory: '1024Ki' }, { name: 'b', cpu: '12m', memory: '1Gi' }, { name: 'c', cpu: '2', memory: '4Mi' }] }],
    }} onSwitchTab={vi.fn()} onSelectItem={vi.fn()} />);
    await waitFor(() => expect(mocks.quotas).toHaveBeenCalledWith('apps'));
    for (const text of ['1/4 Active', '1 Running', '1 Terminating', '1 Failing', '1 Pending', '0/1 Ready', '137m total', '1029 Mi total']) expect(view.getByText(text)).toBeTruthy();
  });

  it('retains quota warning thresholds, bounded bars and permission notices', async () => {
    mocks.quotas.mockResolvedValue({ quotas: [{ name: 'quota', namespace: 'apps', hard: { pods: '100', secrets: '100', services: '0' }, used: { pods: '80', secrets: '150', services: '2' } }], limitRanges: [], rbacForbidden: true });
    const view = render(<K8sNamespaceOverview selectedNamespace="apps" data={data} onSwitchTab={vi.fn()} onSelectItem={vi.fn()} />);
    await waitFor(() => expect(view.getByText('80 / 100 (80%)')).toBeTruthy());
    expect(view.getByText('150 / 100 (100%)')).toBeTruthy();
    expect(view.getByText('2 / 0 (0%)')).toBeTruthy();
    expect(view.getByText('Cluster RBAC Notice: ResourceQuotas Permission Missing')).toBeTruthy();
    expect(view.container.querySelector('.bg-yellow-500.h-full')?.getAttribute('style')).toBe('width: 80%;');
    expect(view.container.querySelector('.bg-red-500.h-full')?.getAttribute('style')).toBe('width: 100%;');
  });

  it('shows loading without fetching quotas when there is no namespace or data', () => {
    const view = render(<K8sNamespaceOverview data={null} onSwitchTab={vi.fn()} onSelectItem={vi.fn()} />);
    expect(view.getByText('Gathering namespace telemetry...')).toBeTruthy();
    expect(mocks.quotas).not.toHaveBeenCalled();
  });

  it('provides named native buttons that receive focus and navigate to each resource', async () => {
    const onSwitchTab = vi.fn();
    const view = render(<K8sNamespaceOverview selectedNamespace="apps" data={data} onSwitchTab={onSwitchTab} onSelectItem={vi.fn()} />);
    await waitFor(() => expect(view.getByRole('button', { name: 'View pods' })).toBeTruthy());
    for (const [label, tab] of [['pods', 'pods'], ['deployments', 'deployments'], ['services', 'services'], ['ConfigMaps', 'configmaps'], ['secrets', 'secrets']]) {
      const button = view.getByRole('button', { name: `View ${label}` });
      expect(button.tagName).toBe('BUTTON');
      expect(button.tabIndex).toBe(0);
      button.focus();
      expect(document.activeElement).toBe(button);
      fireEvent.click(button);
      expect(onSwitchTab).toHaveBeenLastCalledWith(tab);
    }
  });

  it('opens an event independently from its AI diagnosis action', async () => {
    const onSelectItem = vi.fn();
    const view = render(<K8sNamespaceOverview selectedNamespace="apps" data={data} onSwitchTab={vi.fn()} onSelectItem={onSelectItem} />);
    fireEvent.click(view.getByRole('button', { name: 'View event BackOff for api' }));
    expect(onSelectItem).toHaveBeenCalledExactlyOnceWith({ type: 'events', data: event });
    fireEvent.click(view.getByRole('button', { name: 'AI Diagnose' }));
    await waitFor(() => expect(view.getByText('Diagnostic opened')).toBeTruthy());
    expect(onSelectItem).toHaveBeenCalledTimes(1);
  });
});
