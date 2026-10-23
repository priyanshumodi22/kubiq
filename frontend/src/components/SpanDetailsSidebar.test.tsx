// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpanDetailsSidebar } from './SpanDetailsSidebar';
import { ISpan } from '../hooks/useTrace';
afterEach(cleanup);
const span: ISpan = { traceId: 'trace', spanId: 'span', parentSpanId: null, name: 'request', serviceName: 'api', kind: 1, startTimeUnixNano: 0, endTimeUnixNano: 2e6, durationMs: 2, statusCode: 2, timestamp: new Date(0), attributes: { 'db.statement': 'select 1', 'http.url': 'https://example.com/', retries: 0, enabled: false } };

describe('span inspector rendering', () => {
    it('retains attribute rendering, error state and close controls', () => {
        const close = vi.fn();
        const view = render(<SpanDetailsSidebar span={span} onClose={close} />);
        expect(view.getByText('Error')).toBeTruthy();
        expect(view.getByText('2.00 ms')).toBeTruthy();
        expect(view.getByText('select 1').className).toContain('text-blue-300');
        expect(view.getByRole('link', { name: 'https://example.com/' }).getAttribute('rel')).toBe('noopener noreferrer');
        expect(view.getByText('0')).toBeTruthy();
        expect(view.getByText('false')).toBeTruthy();
        fireEvent.click(view.getByRole('button', { name: 'Close span details' }));
        fireEvent.click(view.getByRole('button', { name: 'Dismiss span details' }));
        expect(close).toHaveBeenCalledTimes(2);
    });

    it('retains the empty attribute state and closed inspector state', () => {
        const view = render(<SpanDetailsSidebar span={{ ...span, attributes: {} }} onClose={vi.fn()} />);
        expect(view.getByText('No OpenTelemetry attributes recorded for this span.')).toBeTruthy();
        view.rerender(<SpanDetailsSidebar span={null} onClose={vi.fn()} />);
        expect(view.queryByText('Span Attributes')).toBeNull();
    });
});
