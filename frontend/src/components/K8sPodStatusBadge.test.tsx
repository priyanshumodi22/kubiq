// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { K8sPodStatusBadge } from './K8sPodStatusBadge';

afterEach(cleanup);
describe('pod status display compatibility', () => {
  it.each([
    { status: 'Running', label: 'Running', color: 'text-green-400' },
    { status: { phase: 'Pending', reason: 'CrashLoopBackOff' }, label: 'Pending', color: 'text-yellow-400' },
    { status: { reason: 'CrashLoopBackOff' }, label: 'CrashLoopBackOff', color: 'text-red-400' },
    { status: null, label: 'Active', color: 'text-gray-400' },
  ])('renders $label from the supplied status shape', ({ status, label, color }) => {
    const view = render(<K8sPodStatusBadge status={status} />);
    expect(view.getByText(label).className).toContain(color);
  });
  it('gives termination precedence over a running status', () => {
    const view = render(<K8sPodStatusBadge status="Running" isTerminating />);
    expect(view.getByText('Terminating').className).toContain('text-orange-400');
    expect(view.queryByText('Running')).toBeNull();
  });
});
