// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfilePasskeys } from './ProfilePasskeys';

afterEach(cleanup);
const passkeys = [{ id: 'device-1', name: 'Laptop', deviceType: 'multiDevice', createdAt: 1792800000000 }];
const props = () => ({ loading: false, passkeys, isNative: true, onRename: vi.fn(), onDelete: vi.fn() });

describe('profile passkeys', () => {
  it('shows loading before existing data and distinguishes an empty list', () => {
    const options = props();
    const view = render(<ProfilePasskeys {...options} loading />);
    expect(view.getByText('Loading devices...')).toBeTruthy();
    expect(view.queryByText('Laptop')).toBeNull();
    view.rerender(<ProfilePasskeys {...options} passkeys={[]} />);
    expect(view.getByText('No passkeys configured. Add one to login faster!')).toBeTruthy();
  });

  it('uses named native actions with the selected persisted identity', () => {
    const options = props();
    const view = render(<ProfilePasskeys {...options} />);
    fireEvent.click(view.getByRole('button', { name: 'Rename passkey Laptop' }));
    fireEvent.click(view.getByRole('button', { name: 'Remove passkey Laptop' }));
    expect(options.onRename).toHaveBeenCalledWith('device-1', 'Laptop');
    expect(options.onDelete).toHaveBeenCalledWith('device-1');
  });

  it('does not render mutation controls for externally managed profiles', () => {
    const view = render(<ProfilePasskeys {...props()} isNative={false} />);
    expect(view.getByText('Laptop')).toBeTruthy();
    expect(view.queryByRole('button')).toBeNull();
  });
});
