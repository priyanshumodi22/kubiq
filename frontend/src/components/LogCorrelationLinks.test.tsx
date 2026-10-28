// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LogCorrelationLinks } from './LogCorrelationLinks';
const permission = vi.hoisted(() => ({ read: true }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: () => permission.read }) }));
afterEach(() => { cleanup(); permission.read = true; });
const traceId = 'abcdef1234567890abcdef1234567890', spanId = '1234567890abcdef';
it('links a prefixed JSON log to both exact trace and span under the actual router basename', () => {
    const view = render(<MemoryRouter basename="/kubiq" initialEntries={['/kubiq/logs']}><LogCorrelationLinks message={'[ns/pod/container] '+JSON.stringify({ trace_id: traceId, span_id: spanId })} /></MemoryRouter>);
    expect(view.getByRole('link', { name: 'View trace' }).getAttribute('href')).toBe(`/kubiq/apm?traceId=${traceId}`);
    expect(view.getByRole('link', { name: 'View span' }).getAttribute('href')).toBe(`/kubiq/apm?traceId=${traceId}&spanId=${spanId}`);
});
it('does not confuse request IDs or malformed and zero trace IDs with actual tracing IDs', () => {
    const view = render(<MemoryRouter><LogCorrelationLinks message={'requestId='+traceId+' trace_id=0000000000000000'} /></MemoryRouter>); expect(view.queryByRole('link')).toBeNull();
});
it('supports retained structured metadata and respects APM read permissions', () => {
    const view = render(<MemoryRouter><LogCorrelationLinks message="event" record={{ metadata: { traceId, spanId } }} /></MemoryRouter>); expect(view.getByRole('link', { name: 'View span' })).toBeTruthy();
    permission.read = false; view.rerender(<MemoryRouter><LogCorrelationLinks message={`traceId=${traceId}`} /></MemoryRouter>); expect(view.queryByRole('link')).toBeNull();
});
