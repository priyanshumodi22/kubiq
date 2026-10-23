// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiStatusOrb } from './AiStatusOrb';
const capture = vi.hoisted(() => vi.fn());
vi.mock('@yogesharc/thinking-orbs', () => ({ Orb: (props: unknown) => { capture(props); return null; } }));
afterEach(() => { cleanup(); capture.mockClear(); });
describe('semantic AI orb compatibility', () => {
    it.each([
        ['searching', 'searching', 'text-blue-200'], ['thinking', 'reasoning', 'text-cyan-100'],
        ['working', 'working', 'text-sky-100'], ['pro', 'waiting', 'text-blue-100'],
        ['diagnosing', 'reasoning', 'text-sky-200'],
    ] as const)('retains the %s semantic state and classes', (activity, state, color) => {
        render(<AiStatusOrb activity={activity} className="extra" />);
        expect(capture).toHaveBeenLastCalledWith(expect.objectContaining({ state, className: `${color} extra`, size: 20, density: 1.1, dotSize: 1 }));
        if (activity === 'searching') expect(capture).toHaveBeenLastCalledWith(expect.objectContaining({ variant: 'lighthouse' }));
    });
    it('preserves large-orb sizing and absent class whitespace', () => {
        render(<AiStatusOrb activity="working" size={64} />);
        expect(capture).toHaveBeenLastCalledWith(expect.objectContaining({ className: 'text-sky-100', size: 64, density: 1.35, dotSize: 0.9 }));
    });
});
