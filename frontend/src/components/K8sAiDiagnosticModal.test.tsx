// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { K8sAiDiagnosticModal } from './K8sAiDiagnosticModal';

const mocks = vi.hoisted(() => ({ pod: vi.fn(), event: vi.fn() }));
vi.mock('../services/api', () => ({ apiClient: { aiDiagnosePod: mocks.pod, aiDiagnoseEvent: mocks.event } }));
vi.mock('./AiStatusOrb', () => ({ AiStatusOrb: () => null }));
vi.mock('./ProUpgradeModal', () => ({ ProUpgradeModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div>Upgrade required</div> : null }));
beforeEach(() => {
    vi.clearAllMocks();
    mocks.pod.mockResolvedValue({ diagnosis: '### Diagnosis\n**Repeated** and **Repeated**\n*Setup note*\n- Check `status`\n> Read only' });
    mocks.event.mockResolvedValue({ diagnosis: 'Event diagnosis' });
});
afterEach(cleanup);

describe('Kubernetes diagnosis compatibility', () => {
    it('keeps diagnosis markup and request targeting intact', async () => {
        const view = render(<K8sAiDiagnosticModal isOpen namespace="apps" podName="api" onClose={vi.fn()} />);
        expect(view.getByText('Generating Root Cause Diagnosis...')).toBeTruthy();
        await waitFor(() => expect(view.getByRole('heading', { name: 'Diagnosis' })).toBeTruthy());
        expect(mocks.pod).toHaveBeenCalledWith('apps', 'api');
        expect(view.getAllByText('Repeated')).toHaveLength(2);
        expect(view.getByText('Setup note').tagName).toBe('EM');
        expect(view.getByText('status').tagName).toBe('CODE');
    });

    it('uses event diagnostics when no pod is selected', async () => {
        const event = { reason: 'BackOff', message: 'Retrying' };
        const view = render(<K8sAiDiagnosticModal isOpen namespace="apps" event={event} onClose={vi.fn()} />);
        await waitFor(() => expect(view.getByText('Event diagnosis')).toBeTruthy());
        expect(mocks.event).toHaveBeenCalledWith('apps', event);
        expect(mocks.pod).not.toHaveBeenCalled();
    });

    it('retains the license-upgrade flow for a 402 response', async () => {
        mocks.pod.mockRejectedValue({ response: { status: 402 } });
        const view = render(<K8sAiDiagnosticModal isOpen namespace="apps" podName="api" onClose={vi.fn()} />);
        await waitFor(() => expect(view.getByText('Upgrade required')).toBeTruthy());
    });

    it('does not replace a new target diagnosis with a stale response', async () => {
        let resolveFirst!: (value: { diagnosis: string }) => void;
        mocks.pod.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; })).mockResolvedValue({ diagnosis: 'Current target diagnosis' });
        const view = render(<K8sAiDiagnosticModal isOpen namespace="apps" podName="old-pod" onClose={vi.fn()} />);
        view.rerender(<K8sAiDiagnosticModal isOpen namespace="apps" podName="new-pod" onClose={vi.fn()} />);
        await waitFor(() => expect(view.getByText('Current target diagnosis')).toBeTruthy());
        await act(async () => { resolveFirst({ diagnosis: 'Stale target diagnosis' }); });
        expect(view.getByText('Current target diagnosis')).toBeTruthy();
        expect(view.queryByText('Stale target diagnosis')).toBeNull();
    });

    it('ignores a stale license failure after changing targets', async () => {
        let rejectFirst!: (reason: unknown) => void;
        mocks.pod.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectFirst = reject; }))
            .mockResolvedValue({ diagnosis: 'Current diagnosis' });
        const view = render(<K8sAiDiagnosticModal isOpen namespace="apps" podName="old" onClose={vi.fn()} />);
        view.rerender(<K8sAiDiagnosticModal isOpen namespace="apps" podName="new" onClose={vi.fn()} />);
        await waitFor(() => expect(view.getByText('Current diagnosis')).toBeTruthy());
        await act(async () => { rejectFirst({ response: { status: 402 } }); });
        expect(view.queryByText('Upgrade required')).toBeNull();
        expect(view.getByText('Current diagnosis')).toBeTruthy();
    });

    it('ignores requests completed after closing and reopening the dialog', async () => {
        let resolveFirst!: (value: { diagnosis: string }) => void;
        mocks.pod.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }))
            .mockResolvedValue({ diagnosis: 'Reopened diagnosis' });
        const props = { namespace: 'apps', podName: 'api', onClose: vi.fn() };
        const view = render(<K8sAiDiagnosticModal isOpen {...props} />);
        view.rerender(<K8sAiDiagnosticModal isOpen={false} {...props} />);
        view.rerender(<K8sAiDiagnosticModal isOpen {...props} />);
        await waitFor(() => expect(view.getByText('Reopened diagnosis')).toBeTruthy());
        await act(async () => { resolveFirst({ diagnosis: 'Closed request' }); });
        expect(view.queryByText('Closed request')).toBeNull();
        expect(view.getByText('Reopened diagnosis')).toBeTruthy();
    });
});
