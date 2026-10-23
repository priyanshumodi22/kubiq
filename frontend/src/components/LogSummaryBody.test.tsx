// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogSummaryBody } from './LogSummaryBody';

vi.mock('./AiStatusOrb', () => ({ AiStatusOrb: () => null }));
vi.mock('./AiSummaryContent', () => ({ AiSummaryContent: ({ summary }: { summary: string }) => <p>{summary}</p> }));
afterEach(cleanup);
describe('shared log summary presentation', () => {
    it('shows progress instead of stale summary text while loading', () => {
        const view = render(<LogSummaryBody summarizing summary="Old summary" />);
        expect(view.getByText('Thinking through your logs…')).toBeTruthy();
        expect(view.queryByText('Old summary')).toBeNull();
    });
    it('renders a completed summary', () => {
        const view = render(<LogSummaryBody summarizing={false} summary="Current summary" />);
        expect(view.getByText('Current summary')).toBeTruthy();
    });
    it('keeps the failure message for a missing summary', () => {
        const view = render(<LogSummaryBody summarizing={false} summary={null} />);
        expect(view.getByText('Failed to generate summary.')).toBeTruthy();
    });
});
