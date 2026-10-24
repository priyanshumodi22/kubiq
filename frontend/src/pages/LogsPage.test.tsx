// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LogsPage from './LogsPage';

const mocks = vi.hoisted(() => ({ manage: true }));
vi.mock('../hooks/useServices', () => ({ useServices: () => ({ services: [{ id: 'api-id', name: 'api', currentStatus: 'healthy', history: [], endpoint: '/', logPath: '/api.log', logSources: [{ id: 'log-id', name: 'Server', path: '/api.log' }] }], refresh: vi.fn() }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => mocks.manage }) }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('../services/api', () => ({ apiClient: { getDiscoveredLogServices: async () => ['k8s:apps:web'] } }));
vi.mock('../components/LogViewer', () => ({ LogViewer: ({ serviceName }: { serviceName: string }) => <p>VM viewer: {serviceName}</p> }));
vi.mock('../components/K8sLogViewer', () => ({ K8sLogViewer: ({ namespace, deploymentName }: { namespace: string; deploymentName: string }) => <p>K8s viewer: {namespace}/{deploymentName}</p> }));
vi.mock('../components/ConfigureLogModal', () => ({ ConfigureLogModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <p>Configure logs</p> : null }));
vi.mock('../components/DeleteLogDialog', () => ({ DeleteLogDialog: ({ service }: { service: { name: string } }) => <p>Delete logs: {service.name}</p> }));
afterEach(() => { cleanup(); mocks.manage = true; });

describe('log sidebar native selection', () => {
  it('provides separately focusable native VM and workload selection buttons', async () => {
    const view = render(<LogsPage />);
    expect(view.getByText('No Service Selected')).toBeTruthy();
    const vm = view.getByRole('button', { name: 'View logs for api' });
    expect(vm.tagName).toBe('BUTTON');
    vm.focus();
    expect(document.activeElement).toBe(vm);
    fireEvent.click(vm);
    expect(vm.getAttribute('aria-pressed')).toBe('true');
    expect(view.getByText('VM viewer: api')).toBeTruthy();
    const workload = await view.findByRole('button', { name: 'View logs for k8s:apps:web' });
    fireEvent.click(workload);
    expect(view.getByText('K8s viewer: apps/web')).toBeTruthy();
    expect(vm.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps configuration actions separate from row selection without nesting buttons', async () => {
    const view = render(<LogsPage />);
    await waitFor(() => expect(view.getByRole('button', { name: 'View logs for k8s:apps:web' })).toBeTruthy());
    fireEvent.click(view.getByTitle('Edit log configuration'));
    expect(view.getByText('Configure logs')).toBeTruthy();
    expect(view.getByText('No Service Selected')).toBeTruthy();
    fireEvent.click(view.getByTitle('Remove log configuration'));
    expect(view.getByText('Delete logs: api')).toBeTruthy();
    expect(view.container.querySelector('button button')).toBeNull();
  });

  it('does not expose management actions to read-only viewers', async () => {
    mocks.manage = false;
    const view = render(<LogsPage />);
    await waitFor(() => expect(view.getByRole('button', { name: 'View logs for k8s:apps:web' })).toBeTruthy());
    expect(view.queryByTitle('Edit log configuration')).toBeNull();
    expect(view.queryByTitle('Remove log configuration')).toBeNull();
    expect(view.queryByTitle('Add Log Source')).toBeNull();
  });
});
