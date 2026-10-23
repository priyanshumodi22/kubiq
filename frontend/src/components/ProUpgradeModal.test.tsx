// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProUpgradeModal } from './ProUpgradeModal';

vi.mock('./AiStatusOrb', () => ({ AiStatusOrb: () => null }));
afterEach(cleanup);
describe('Pro availability messages', () => {
    it.each([
        ['AI_NOT_CONFIGURED', 'kubi is being configured'],
        ['DISABLED', 'kubi is not enabled'],
    ] as const)('shows configuration guidance rather than pricing for %s', (reason, title) => {
        const onClose = vi.fn();
        const view = render(<ProUpgradeModal isOpen onClose={onClose} unavailableReason={reason} />);
        expect(view.getByRole('heading', { name: title })).toBeTruthy();
        expect(view.queryByRole('link', { name: 'View kubiq Pro plans' })).toBeNull();
        fireEvent.click(view.getByRole('button', { name: 'Close kubiq Pro dialog' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
    it('retains the normal upgrade link when no unavailable reason applies', () => {
        const view = render(<ProUpgradeModal isOpen onClose={vi.fn()} />);
        expect(view.getByRole('heading', { name: 'Unlock kubiq Pro' })).toBeTruthy();
        expect(view.getByRole('link', { name: 'View kubiq Pro plans' }).getAttribute('href')).toBe('https://kubiq.priyanshumodi.in/pricing');
    });
});
