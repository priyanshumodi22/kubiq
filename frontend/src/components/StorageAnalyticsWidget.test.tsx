// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageAnalyticsWidget } from './StorageAnalyticsWidget';
const mocks = vi.hoisted(() => ({ allowed: true, toast: vi.fn(), disks: vi.fn(), save: vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => mocks.allowed }) }));
vi.mock('../contexts/ToastContext', () => ({ useToast: () => ({ addToast: mocks.toast }) }));
const disks = [75, 90, 91].map(use => ({ mount: `/disk${use}`, fs: 'ext4', type: 'disk', size: 2 ** 30, used: 2 ** 29, use }));
vi.mock('../services/api', () => ({ apiClient: {
    getSystemStats: vi.fn(async () => ({ disks })), getStoragePrediction: vi.fn(async () => []),
    getMonitoredDisksConfig: vi.fn(async () => []), getAllDisks: mocks.disks, updateMonitoredDisks: mocks.save,
} }));
beforeEach(() => {
    vi.clearAllMocks(); mocks.allowed = true;
    mocks.disks.mockResolvedValue(disks); mocks.save.mockResolvedValue({});
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('storage analytics compatibility', () => {
    it('retains utilization threshold colors and empty selection means all disks', async () => {
        const view = render(<StorageAnalyticsWidget />);
        await waitFor(() => expect(view.getByText('75%')).toBeTruthy());
        expect(view.getByText('75%').className).toContain('text-green-500');
        expect(view.getByText('90%').className).toContain('text-yellow-500');
        expect(view.getByText('91%').className).toContain('text-red-500');
    });
    it('uses kubiq toasts when saving the selected volumes', async () => {
        const view = render(<StorageAnalyticsWidget />);
        await waitFor(() => expect(view.getByRole('button', { name: 'Configure Disks' })).toBeTruthy());
        fireEvent.click(view.getByRole('button', { name: 'Configure Disks' }));
        await waitFor(() => expect(view.getByRole('checkbox', { name: /disk75/ })).toBeTruthy());
        fireEvent.click(view.getByRole('checkbox', { name: /disk75/ }));
        fireEvent.click(view.getByRole('button', { name: 'Save Changes' }));
        await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(['/disk75']));
        await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('Storage preferences saved successfully! 💾', 'success'));
    });
    it('rejects a configuration click after permission revocation with a kubiq toast', async () => {
        const view = render(<StorageAnalyticsWidget />);
        await waitFor(() => expect(view.getByRole('button', { name: 'Configure Disks' })).toBeTruthy());
        mocks.allowed = false;
        fireEvent.click(view.getByRole('button', { name: 'Configure Disks' }));
        expect(mocks.disks).not.toHaveBeenCalled();
        expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Access Denied'), 'error');
    });
    it('rejects saving an already-open configuration after permission revocation', async () => {
        const view = render(<StorageAnalyticsWidget />);
        await waitFor(() => expect(view.getByRole('button', { name: 'Configure Disks' })).toBeTruthy());
        fireEvent.click(view.getByRole('button', { name: 'Configure Disks' }));
        await waitFor(() => expect(view.getByRole('button', { name: 'Save Changes' })).toBeTruthy());
        mocks.allowed = false;
        fireEvent.click(view.getByRole('button', { name: 'Save Changes' }));
        expect(mocks.save).not.toHaveBeenCalled();
        expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Access Denied'), 'error');
    });
    it('reports disk discovery failure through kubiq toast', async () => {
        mocks.disks.mockRejectedValue(new Error('Unavailable'));
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const view = render(<StorageAnalyticsWidget />);
            await waitFor(() => expect(view.getByRole('button', { name: 'Configure Disks' })).toBeTruthy());
            fireEvent.click(view.getByRole('button', { name: 'Configure Disks' }));
            await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('Failed to load disk list', 'error'));
        } finally { error.mockRestore(); }
    });
});
