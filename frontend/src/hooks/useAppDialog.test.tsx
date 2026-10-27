// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppDialog } from './useAppDialog';
const answer = vi.fn();
const show = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeEach(() => {
  answer.mockClear();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterEach(() => {
  cleanup();
  for (const [name, descriptor] of [['showModal', show], ['close', close]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});
function Harness() {
  const app = useAppDialog();
  return <><button onClick={() => { void app.confirm({ title: 'Delete user', message: 'Delete fixture?', confirmText: 'Delete user' }).then(answer); }}>Open confirmation</button><button onClick={() => { void app.password({ title: 'Reset password', message: 'Choose a temporary password.', confirmText: 'Set password' }).then(answer); }}>Open password</button>{app.dialog}</>;
}
it('uses the shared kubiq confirmation and resolves only after the chosen action', async () => {
  const view = render(<Harness />);
  fireEvent.click(view.getByRole('button', { name: 'Open confirmation' }));
  expect(answer).not.toHaveBeenCalled();
  expect(view.getByRole('dialog', { name: 'Delete user' })).toBeTruthy();
  fireEvent.click(view.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(answer).toHaveBeenLastCalledWith(false));
  fireEvent.click(view.getByRole('button', { name: 'Open confirmation' }));
  fireEvent.click(view.getByRole('button', { name: 'Delete user' }));
  await waitFor(() => expect(answer).toHaveBeenLastCalledWith(true));
});
it('masks and validates password entry, and clears it when cancelled or completed', async () => {
  const view = render(<Harness />);
  fireEvent.click(view.getByRole('button', { name: 'Open password' }));
  expect(view.getByLabelText('Temporary password').getAttribute('type')).toBe('password');
  fireEvent.click(view.getByRole('button', { name: 'Set password' }));
  expect(view.getByRole('alert').textContent).toContain('12 characters');
  expect(answer).not.toHaveBeenCalled();
  fireEvent.change(view.getByLabelText('Temporary password'), { target: { value: 'SYNTHETIC_PASSWORD' } });
  fireEvent.submit(view.getByRole('dialog').querySelector('form')!);
  await waitFor(() => expect(answer).toHaveBeenLastCalledWith('SYNTHETIC_PASSWORD'));
  fireEvent.click(view.getByRole('button', { name: 'Open password' }));
  expect(view.getByLabelText('Temporary password')).toHaveProperty('value', '');
  fireEvent(view.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  await waitFor(() => expect(answer).toHaveBeenLastCalledWith(null));
});
it('cancels a pending action when the page unmounts', async () => {
  const view = render(<Harness />);
  fireEvent.click(view.getByRole('button', { name: 'Open confirmation' }));
  view.unmount();
  await waitFor(() => expect(answer).toHaveBeenCalledWith(false));
});
