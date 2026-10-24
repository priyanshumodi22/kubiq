// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KubiMarkdown } from './KubiMarkdown';

afterEach(cleanup);
describe('kubi Markdown references', () => {
  it('keeps reference buttons mounted during streamed updates and calls the latest navigation handler', () => {
    const previous = vi.fn();
    const next = vi.fn();
    const view = render(<KubiMarkdown content="[Evidence](/dashboard)" onNavigate={previous} />);
    const link = view.getByRole('button', { name: 'Evidence' });
    link.focus();
    view.rerender(<KubiMarkdown content="[Evidence](/dashboard) more text" onNavigate={next} />);
    expect(view.getByRole('button', { name: 'Evidence' })).toBe(link);
    expect(document.activeElement).toBe(link);
    fireEvent.click(link);
    expect(next).toHaveBeenCalledWith('/dashboard');
    expect(previous).not.toHaveBeenCalled();
  });

  it('omits remote images and preserves their alternative text', () => {
    const view = render(<KubiMarkdown content="![Fixture diagram](https://example.test/image.png)" onNavigate={vi.fn()} />);
    expect(view.queryByRole('img')).toBeNull();
    expect(view.getByText('Fixture diagram')).toBeTruthy();
  });
});
