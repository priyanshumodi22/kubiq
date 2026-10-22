// @vitest-environment jsdom
import { useEffect } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useToast } from './ToastContext';
import { ToastProvider } from './ToastProvider';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
function Probe({ changed }: Readonly<{ changed: () => void }>) {
  const toast = useToast();
  useEffect(changed, [changed, toast]);
  return <button type="button" onClick={() => { toast.error('Denied'); toast.success('Saved'); }}>Show both</button>;
}

describe('kubiq toast lifecycle', () => {
  it('keeps same-tick notifications independent and context actions stable', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    const changed = vi.fn();
    const view = render(<ToastProvider><Probe changed={changed} /></ToastProvider>);
    fireEvent.click(view.getByRole('button', { name: 'Show both' }));
    expect(view.getByText('Denied')).toBeTruthy();
    expect(view.getByText('Saved')).toBeTruthy();
    expect(changed).toHaveBeenCalledTimes(1);
    fireEvent.click(view.getByRole('button', { name: 'Dismiss Denied' }));
    expect(view.queryByText('Denied')).toBeNull();
    expect(view.getByText('Saved')).toBeTruthy();
  });
  it('receives permission-denial events and clears timers on unmount', () => {
    vi.useFakeTimers();
    const view = render(<ToastProvider><span>App</span></ToastProvider>);
    act(() => { globalThis.dispatchEvent(new CustomEvent('kubiq:toast', { detail: { message: 'Permission required', type: 'error' } })); });
    expect(view.getByRole('alert').textContent).toContain('Permission required');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(view.queryByText('Permission required')).toBeNull();
    act(() => { globalThis.dispatchEvent(new CustomEvent('kubiq:toast', { detail: { message: 'Another', type: 'info' } })); });
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
