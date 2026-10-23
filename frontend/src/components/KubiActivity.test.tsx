// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KubiActivity } from './KubiActivity';
import { K8sPodStatusBadge } from './K8sPodStatusBadge';

vi.mock('./KubiAvatar', () => ({ KubiAvatar: () => <div /> }));
afterEach(cleanup);

describe('investigation progress semantics', () => {
  it('prioritizes active progress and distinguishes visited and unreached steps', () => {
    const view = render(<KubiActivity state="searching" steps={['thinking']} phase="Finding evidence" />);
    expect(view.getByText('Investigation in progress')).toBeTruthy();
    expect(view.getByRole('status').textContent).toBe('Finding evidence');
    expect(view.container.querySelector('[aria-current="step"]')?.textContent).toContain('Find evidence: in progress');
    expect(view.getByText(': visited')).toBeTruthy();
    expect(view.getAllByText(': not reached')).toHaveLength(2);
  });

  it('reports interrupted and completed investigation captions', () => {
    const view = render(<KubiActivity state="error" steps={[]} phase={null} />);
    expect(view.getByText('Investigation interrupted')).toBeTruthy();
    view.rerender(<KubiActivity state="idle" steps={[]} phase={null} />);
    expect(view.getByText('Investigation complete')).toBeTruthy();
  });
});

describe('pod status indicator precedence', () => {
  it.each([
    ['Running', false, 'Running', 'animate-pulse bg-green-400'],
    ['Running', true, 'Terminating', 'animate-pulse bg-orange-400'],
    ['Pending', false, 'Pending', 'bg-current'],
  ])('preserves %s status when terminating=%s', (status, isTerminating, label, classes) => {
    const view = render(<K8sPodStatusBadge status={status} isTerminating={isTerminating} />);
    expect(view.getByText(label)).toBeTruthy();
    expect(view.container.querySelector('span')?.className).toContain(classes);
  });
});
