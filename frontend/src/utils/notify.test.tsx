// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ToastProvider } from '../contexts/ToastProvider';
import { notify } from './notify';
afterEach(cleanup);
it('routes validation and failure messages through the kubiq toast component', () => {
  const view = render(<ToastProvider><span>Application</span></ToastProvider>);
  act(() => { notify('Start time must be before end time.', 'warning'); notify('Failed to save configuration'); });
  expect(view.getByRole('status').textContent).toContain('Start time must be before end time.');
  expect(view.getAllByRole('alert').map(alert => alert.textContent).join(' ')).toContain('Failed to save configuration');
});
