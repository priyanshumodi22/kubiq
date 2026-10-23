// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UserAvatar } from './Header';

afterEach(cleanup);

describe('header avatar', () => {
  it('retains the image element while parent data changes and supplies a concise accessible name', () => {
    const view = render(<UserAvatar avatarUrl="/avatar.png" initials="PM" />);
    const image = view.getByRole('img', { name: 'Your avatar' });
    view.rerender(<UserAvatar avatarUrl="/next-avatar.png" initials="KM" className="w-10 h-10" />);
    expect(view.getByRole('img', { name: 'Your avatar' })).toBe(image);
    expect(image.getAttribute('src')).toBe('/next-avatar.png');
  });

  it('uses the latest initials when no avatar is configured', () => {
    const view = render(<UserAvatar initials="PM" />);
    expect(view.queryByRole('img')).toBeNull();
    expect(view.getByText('PM')).toBeTruthy();
    view.rerender(<UserAvatar avatarUrl="" initials="KM" />);
    expect(view.getByText('KM')).toBeTruthy();
  });
});
