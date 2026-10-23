// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TraceWaterfall from './TraceWaterfall';
import { ISpan } from '../hooks/useTrace';

vi.mock('./SpanDetailsSidebar', () => ({ SpanDetailsSidebar: ({ span, onClose }: { span: ISpan | null; onClose: () => void }) => span ? <button onClick={onClose}>Close {span.spanId}</button> : null }));
afterEach(cleanup);
const span = (id: string, start: number, duration: number, parent: string | null = null): ISpan => ({ traceId: 'trace', spanId: id, parentSpanId: parent, name: id, serviceName: 'api', startTimeUnixNano: start * 1e6, endTimeUnixNano: (start + duration) * 1e6, durationMs: duration, statusCode: 0, attributes: {}, kind: 1, timestamp: new Date(0) });

describe('trace waterfall compatibility', () => {
    it('keeps chronological tree ordering, depth and native span selection', () => {
        const view = render(<TraceWaterfall spans={[span('late', 90, 5, 'root'), span('root', 0, 100), span('early', 10, 5, 'root')]} />);
        const buttons = view.getAllByRole('button', { name: /^Inspect span/ });
        expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(['Inspect span root from api', 'Inspect span early from api', 'Inspect span late from api']);
        expect(buttons[1].tabIndex).toBe(0);
        expect(buttons[1].nextElementSibling?.getAttribute('style')).toContain('padding-left: 16px');
        fireEvent.click(buttons[1]);
        expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(view.getByRole('button', { name: 'Close early' }));
        expect(buttons[1].getAttribute('aria-pressed')).toBe('false');
    });

    it('preserves the three duration-label placement branches', () => {
        const view = render(<TraceWaterfall spans={[span('root', 0, 100), span('short', 10, 4), span('tail', 96, 4)]} />);
        const labels = view.getAllByText('4.00ms') as HTMLElement[];
        expect(view.getAllByText('100.00ms').some(element => element.style.left.includes('8px'))).toBe(true);
        expect(labels[0].style.left).toContain('14%');
        expect(labels[0].style.right).toBe('auto');
        expect(labels[1].style.left).toBe('auto');
        expect(labels[1].style.right).toContain('4%');
    });

    it('renders no graph for an empty trace', () => {
        const view = render(<TraceWaterfall spans={[]} />);
        expect(view.container.innerHTML).toBe('');
    });
});
