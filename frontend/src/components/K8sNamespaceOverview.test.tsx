// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { K8sNamespaceOverview } from './K8sNamespaceOverview';

vi.mock('../services/api', () => ({ apiClient: { getKubernetesQuotas: async () => ({ quotas: [], limitRanges: [] }) } }));
vi.mock('./AiStatusOrb', () => ({ AiStatusOrb: () => null }));
vi.mock('./K8sAiDiagnosticModal', () => ({ K8sAiDiagnosticModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>Diagnostic opened</div> : null }));
afterEach(cleanup);

const event = { name: 'pod-warning.123', type: 'Warning', reason: 'BackOff', message: 'Retrying', involvedObject: 'api', involvedKind: 'Pod', count: 2, lastTimestamp: null };
const data = { pods: [], deployments: [], services: [], configMaps: [], secrets: [], events: [event], metrics: [] };

describe('namespace navigation controls', () => {
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
