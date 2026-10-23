// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TimeRangeSlider } from './TimeRangeSlider';

afterEach(cleanup);

describe('time range tick identity', () => {
  it('retains a calendar tick when the earliest day drops out of the range', () => {
    const max = new Date(2026, 9, 24, 12).getTime();
    const start = new Date(2026, 9, 17).getTime();
    const props = { minMs: start, maxMs: max, value: [start, max] as [number, number], onChange: vi.fn() };
    const view = render(<TimeRangeSlider {...props} />);
    const yesterday = view.getByText('Yesterday');
    const tick = yesterday.parentElement;
    view.rerender(<TimeRangeSlider {...props} minMs={start + 86400000} />);
    expect(view.getByText('Yesterday').parentElement).toBe(tick);
  });

  it('keeps Today and Now distinct when their timestamps coincide at midnight', () => {
    const max = new Date(2026, 9, 24).getTime();
    const view = render(<TimeRangeSlider minMs={max} maxMs={max} value={[max, max]} onChange={vi.fn()} />);
    expect(view.getByText('Today').parentElement).not.toBe(view.getByText('Now').parentElement);
  });
});
