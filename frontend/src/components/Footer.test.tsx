// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Footer from './Footer';
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterEach(() => {
  cleanup();
  if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
describe('license dialog compatibility', () => {
  it('opens the native dialog and retains legal links and original license content', () => {
    const view = render(<Footer />);
    expect(view.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('https://kubiq.priyanshumodi.in/privacy');
    fireEvent.click(view.getByRole('button', { name: 'License' }));
    const dialog = view.getByRole('dialog', { name: 'Elastic License 2.0' });
    expect((dialog as HTMLDialogElement).open).toBe(true);
    expect(view.getByRole('link', { name: 'View original on GitHub' }).getAttribute('href')).toContain('/kubiq/blob/main/LICENSE');
    fireEvent.click(view.getByRole('heading', { name: 'Elastic License 2.0' }));
    expect(view.getByRole('dialog')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Close license' }));
    expect(view.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(view.getByRole('button', { name: 'License' }));
  });
  it('handles native Escape cancellation and backdrop dismissal', () => {
    const view = render(<Footer />);
    fireEvent.click(view.getByRole('button', { name: 'License' }));
    fireEvent(view.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(view.queryByRole('dialog')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'License' }));
    fireEvent.click(view.getByRole('dialog'), { clientX: -10, clientY: -10 });
    expect(view.queryByRole('dialog')).toBeNull();
  });
});
