// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServiceStatus } from '../types';
import { ConfigureLogModal } from './ConfigureLogModal';

const mocks = vi.hoisted(() => ({ services: [] as ServiceStatus[], update: vi.fn(), allowed: true, warning: vi.fn(), success: vi.fn() }));
vi.mock('../hooks/useServices', () => ({ useServices: () => ({ services: mocks.services }) }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => mocks.allowed }) }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ warning: mocks.warning, success: mocks.success }) }));
vi.mock('../services/api', () => ({ apiClient: { updateService: mocks.update } }));
const service = (name: string): ServiceStatus => ({ name, endpoint: 'https://example.test', currentStatus: 'healthy', history: [], logSources: [{ id: name + '-stored', name: 'Stored', path: '/stored.log' }] });
beforeEach(() => { vi.clearAllMocks(); mocks.allowed = true; mocks.services = [service('api'), service('worker')]; mocks.update.mockResolvedValue({}); });
afterEach(cleanup);

describe('log configuration draft and keyboard lifecycle', () => {
  it('names controls, supports arrow selection and returns focus to the trigger', async () => {
    const view = render(<ConfigureLogModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    const trigger = view.getByLabelText('Select Service');
    fireEvent.click(trigger);
    const search = view.getByLabelText('Search services');
    expect(document.activeElement).toBe(search);
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('api');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toContain('worker');
    fireEvent.click(document.activeElement!);
    expect(document.activeElement).toBe(trigger);
    expect(trigger.textContent).toContain('worker');
    expect(view.getByLabelText('Log source label')).toBeTruthy();
    expect(view.getByLabelText('Log source path')).toBeTruthy();
    expect(view.getByLabelText('Log source file limit')).toBeTruthy();
  });

  it('preserves unsaved edits across polling but loads the newly selected service', async () => {
    const props = { isOpen: true, onClose: vi.fn(), onSuccess: vi.fn(), preSelectedService: 'api' };
    const view = render(<ConfigureLogModal {...props} />);
    fireEvent.click(view.getByLabelText('Remove Stored'));
    fireEvent.change(view.getByLabelText('Log source label'), { target: { value: 'Draft' } });
    fireEvent.change(view.getByLabelText('Log source path'), { target: { value: '/draft.log' } });
    fireEvent.click(view.getByRole('button', { name: 'Add Log Source' }));
    mocks.services = [service('api'), service('worker')];
    view.rerender(<ConfigureLogModal {...props} />);
    expect(view.queryByLabelText('Remove Stored')).toBeNull();
    expect(view.getByLabelText('Remove Draft')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith('api', { endpoint: 'https://example.test', type: undefined, ignoreSSL: undefined, logPath: '', logSources: [expect.objectContaining({ name: 'Draft', path: '/draft.log', id: expect.any(String) })] }));
    view.rerender(<ConfigureLogModal {...props} preSelectedService="worker" />);
    expect(view.getByLabelText('Remove Stored')).toBeTruthy();
    expect(view.queryByLabelText('Remove Draft')).toBeNull();
  });

  it('prevents a read-only form submission and uses the kubiq toast', () => {
    mocks.allowed = false;
    const view = render(<ConfigureLogModal isOpen preSelectedService="api" onClose={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.submit(view.container.querySelector('form')!);
    expect(mocks.warning).toHaveBeenCalledWith('You do not have permission to perform this action.');
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
