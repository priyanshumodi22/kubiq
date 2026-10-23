// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NamespaceScopeDialog, type NamespaceScopeUser } from './NamespaceScopeDialog';
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
const save = vi.fn();
const show = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; show(); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterEach(() => {
  cleanup();
  if (originalShow) Object.defineProperty(HTMLDialogElement.prototype, 'showModal', originalShow);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
function ScopeFixture({ loading = false, available = ['apps', 'default'] }: { loading?: boolean; available?: string[] }) {
  const [user, setUser] = useState<(NamespaceScopeUser & { email?: string }) | null>(null);
  return <>
    <button onClick={() => setUser({ id: 'operator', username: 'operator', email: 'operator@example.test', allowedNamespaces: ['apps'] })}>Open scope</button>
    {user && <NamespaceScopeDialog namespaceDialog={user} setNamespaceDialog={setUser} availableNamespaces={available} namespaceLoading={loading} onClose={() => setUser(null)} saveNamespaces={async event => { event.preventDefault(); save(user); setUser(null); }} />}
  </>;
}
describe('native namespace scope dialog', () => {
  it('preserves selected namespaces and user identity without remounting on checkbox changes', () => {
    const view = render(<ScopeFixture />);
    const trigger = view.getByRole('button', { name: 'Open scope' }); trigger.focus(); fireEvent.click(trigger);
    expect(view.getByRole('dialog', { name: 'Namespaces for operator' })).toBeTruthy();
    expect(document.activeElement).toBe(view.getByRole('button', { name: 'Cancel' }));
    expect((view.getByRole('checkbox', { name: 'apps' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(view.getByRole('checkbox', { name: 'default' }));
    expect(show).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole('button', { name: 'Save access' }));
    expect(save).toHaveBeenCalledWith({ id: 'operator', username: 'operator', email: 'operator@example.test', allowedNamespaces: ['apps', 'default'] });
    expect(view.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(trigger);
  });
  it('retains Select all and Clear semantics, including deliberately empty scope', () => {
    const view = render(<ScopeFixture />); fireEvent.click(view.getByRole('button', { name: 'Open scope' }));
    fireEvent.click(view.getByRole('button', { name: 'Select all' }));
    expect(view.getAllByRole('checkbox').every(item => (item as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Clear' }));
    fireEvent.click(view.getByRole('button', { name: 'Save access' }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ allowedNamespaces: [] }));
  });
  it('cancels without saving and restores the trigger on native Escape cancellation', () => {
    const view = render(<ScopeFixture />); const trigger = view.getByRole('button', { name: 'Open scope' }); trigger.focus(); fireEvent.click(trigger);
    fireEvent(view.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(save).not.toHaveBeenCalled(); expect(view.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(trigger);
  });
  it('keeps saving disabled while namespace discovery is loading', () => {
    const view = render(<ScopeFixture loading />); fireEvent.click(view.getByRole('button', { name: 'Open scope' }));
    expect((view.getByRole('button', { name: 'Save access' }) as HTMLButtonElement).disabled).toBe(true);
    expect(view.getByText('Loading cluster namespaces…')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Cancel' })); expect(save).not.toHaveBeenCalled();
  });
  it('preserves the empty namespace discovery state', () => {
    const view = render(<ScopeFixture available={[]} />); fireEvent.click(view.getByRole('button', { name: 'Open scope' }));
    expect(view.getByText('No cluster namespaces are available to select.')).toBeTruthy();
  });
});
