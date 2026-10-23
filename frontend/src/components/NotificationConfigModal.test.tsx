// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationConfigModal } from './NotificationConfigModal';

const mocks = vi.hoisted(() => ({ allowed: true, toast: vi.fn(), update: vi.fn(), test: vi.fn(), remove: vi.fn(), list: vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => mocks.allowed }) }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ addToast: mocks.toast }) }));
vi.mock('../services/api', () => ({ apiClient: {
    getNotificationChannels: mocks.list,
    getNotificationHistory: vi.fn().mockResolvedValue([]),
    getMaintenanceConfig: vi.fn().mockResolvedValue({ maintenanceMode: false, mutedNamespaces: [], mutedServices: [] }),
    updateNotificationChannel: mocks.update, testNotificationChannel: mocks.test, deleteNotificationChannel: mocks.remove,
} }));
const channel = { id: 'persisted-id', name: 'Ops', type: 'webhook', config: { webhookUrl: 'https://example.com/hook' }, enabled: true, events: { up: true, down: false } };
beforeEach(() => {
    vi.clearAllMocks();
    mocks.allowed = true;
    mocks.list.mockResolvedValue([channel]);
    mocks.update.mockResolvedValue({});
});
afterEach(cleanup);

describe('notification channel actions', () => {
    it('keeps persisted channel identity and settings when toggling', async () => {
        const view = render(<NotificationConfigModal isOpen onClose={vi.fn()} />);
        await waitFor(() => expect(view.getByText('Ops')).toBeTruthy());
        fireEvent.click(view.getByTitle('Disable Channel'));
        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(channel.id, { ...channel, enabled: false }));
    });

    it('shows kubiq denial toasts and sends no mutations for unauthorized actions', async () => {
        mocks.allowed = false;
        const view = render(<NotificationConfigModal isOpen onClose={vi.fn()} />);
        await waitFor(() => expect(view.getByText('Ops')).toBeTruthy());
        for (const button of view.getAllByTitle('Access Denied')) fireEvent.click(button);
        expect(mocks.toast).toHaveBeenCalledTimes(3);
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.remove).not.toHaveBeenCalled();
        expect(view.queryByRole('button', { name: 'Add Channel' })).toBeNull();
    });

    it('retains saved form values and returns to the list on cancel', async () => {
        const view = render(<NotificationConfigModal isOpen onClose={vi.fn()} />);
        await waitFor(() => expect(view.getByText('Ops')).toBeTruthy());
        fireEvent.click(view.getByTitle('Edit Channel'));
        expect((view.getByLabelText('Friendly Name') as HTMLInputElement).value).toBe('Ops');
        expect((view.getByLabelText('Webhook URL') as HTMLInputElement).value).toBe(channel.config.webhookUrl);
        fireEvent.click(view.getByRole('button', { name: 'Cancel' }));
        expect(view.queryByLabelText('Friendly Name')).toBeNull();
        expect(view.getByText('Ops')).toBeTruthy();
    });
});
