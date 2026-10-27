// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { KubernetesLogSourceModal } from './KubernetesLogSourceModal';
import { SavedKubernetesLogSources } from './SavedKubernetesLogSources';
import { LogSourceTypeDialog } from './LogSourceTypeDialog';

const mocks = vi.hoisted(() => ({ manage: true, allowed: true, toast: vi.fn(), namespaces: vi.fn(), targets: vi.fn(), containers: vi.fn(), save: vi.fn(), list: vi.fn(), remove: vi.fn() }));
vi.mock('../services/api', () => ({ apiClient: { getKubernetesLogNamespaces: mocks.namespaces, getKubernetesLogTargets: mocks.targets, getKubernetesLogContainers: mocks.containers, saveKubernetesLogSource: mocks.save, getKubernetesLogSources: mocks.list, removeKubernetesLogSource: mocks.remove } }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ addToast: mocks.toast }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: (permission: string) => permission === 'kubernetes.read' ? mocks.allowed : mocks.manage }) }));
const source = { id: 'saved', name: 'Web logs', namespace: 'apps', kind: 'service' as const, resource: 'web', updatedAt: 1 };
beforeEach(() => {
  vi.clearAllMocks(); mocks.manage = true; mocks.allowed = true;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  mocks.namespaces.mockResolvedValue(['apps']); mocks.targets.mockResolvedValue([{ name: 'web' }]); mocks.containers.mockResolvedValue(['web', 'proxy']); mocks.save.mockResolvedValue(source); mocks.list.mockResolvedValue([source]); mocks.remove.mockResolvedValue(undefined);
});
afterEach(cleanup);
it('chooses VM or Kubernetes using kubiq dialog actions and handles Escape', () => {
  const vm = vi.fn(), kube = vi.fn(), close = vi.fn();
  const view = render(<LogSourceTypeDialog kubernetes onVM={vm} onKubernetes={kube} onClose={close} />);
  fireEvent.click(view.getByRole('button', { name: 'VM service logs' })); expect(vm).toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: 'Kubernetes logs' })); expect(kube).toHaveBeenCalled();
  fireEvent(view.getByRole('dialog'), new Event('cancel', { bubbles: true })); expect(close).toHaveBeenCalled();
});
it('validates fields with a kubiq toast and saves a discovered target', async () => {
  const saved = vi.fn(), close = vi.fn();
  const view = render(<KubernetesLogSourceModal source={null} onSaved={saved} onClose={close} />);
  await view.findByRole('option', { name: 'apps' });
  fireEvent.click(view.getByRole('button', { name: 'Save source' })); expect(mocks.toast).toHaveBeenCalledWith(expect.any(String), 'warning');
  fireEvent.change(view.getByLabelText('Source label'), { target: { value: 'Web logs' } });
  fireEvent.change(view.getByLabelText('Namespace'), { target: { value: 'apps' } });
  await view.findAllByRole('option', { name: 'web' });
  fireEvent.change(view.getByLabelText('Resource'), { target: { value: 'web' } });
  await view.findByRole('option', { name: 'proxy' });
  fireEvent.change(view.getByLabelText('Container'), { target: { value: 'proxy' } });
  fireEvent.click(view.getByRole('button', { name: 'Save source' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ name: 'Web logs', namespace: 'apps', kind: 'deployment', resource: 'web', container: 'proxy' }, undefined));
  await waitFor(() => expect(saved).toHaveBeenCalled()); expect(close).toHaveBeenCalled();
});
it('updates an existing source, reports server failure and supports whole-namespace selection', async () => {
  mocks.save.mockRejectedValueOnce(new Error('offline'));
  const close = vi.fn(); const view = render(<KubernetesLogSourceModal source={source} onSaved={vi.fn()} onClose={close} />);
  await view.findAllByRole('option', { name: 'web' });
  fireEvent.click(view.getByRole('button', { name: 'Save source' }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.any(String), 'error'));
  fireEvent.change(view.getByLabelText('Resource type'), { target: { value: 'namespace' } });
  expect(view.queryByLabelText('Resource')).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'Save source' }));
  await waitFor(() => expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'namespace' }), 'saved'));
  fireEvent(view.getByRole('dialog'), new Event('cancel', { bubbles: true })); expect(close).toHaveBeenCalled();
});
it('shows discovery failures instead of presenting an empty healthy list', async () => {
  mocks.namespaces.mockRejectedValueOnce(new Error('denied'));
  const view = render(<KubernetesLogSourceModal source={null} onSaved={vi.fn()} onClose={vi.fn()} />);
  expect(await view.findByRole('alert')).toBeTruthy();
});
it('selects/edits saved sources and removes only after a built-in confirmation', async () => {
  const selected = vi.fn(), edited = vi.fn(), removed = vi.fn();
  const view = render(<SavedKubernetesLogSources version={0} search="" onSelect={selected} onEdit={edited} onRemoved={removed} />);
  fireEvent.click(await view.findByRole('button', { name: 'View logs for Web logs' })); expect(selected).toHaveBeenCalledWith(source);
  fireEvent.click(view.getByRole('button', { name: 'Edit Web logs' })); expect(edited).toHaveBeenCalledWith(source);
  fireEvent.click(view.getByRole('button', { name: 'Remove Web logs' }));
  fireEvent.click(view.getByRole('button', { name: 'Cancel' })); expect(mocks.remove).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: 'Remove Web logs' }));
  fireEvent.click(view.getByRole('button', { name: 'Remove source' }));
  await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('saved')); expect(removed).toHaveBeenCalled();
});
it('keeps read-only viewers free of management controls, filters sources and reports failures', async () => {
  mocks.manage = false;
  const props = { version: 0, search: '', onSelect: vi.fn(), onEdit: vi.fn(), onRemoved: vi.fn() };
  const view = render(<SavedKubernetesLogSources {...props} />);
  await view.findByRole('button', { name: 'View logs for Web logs' }); expect(view.queryByRole('button', { name: 'Edit Web logs' })).toBeNull();
  view.rerender(<SavedKubernetesLogSources {...props} search="missing" />); expect(view.queryByRole('button', { name: 'View logs for Web logs' })).toBeNull();
  mocks.list.mockRejectedValueOnce(new Error('offline')); view.rerender(<SavedKubernetesLogSources {...props} version={1} />); expect(await view.findByRole('alert')).toBeTruthy();
  mocks.allowed = false; view.rerender(<SavedKubernetesLogSources {...props} version={2} />); expect(view.queryByRole('region')).toBeNull();
});
