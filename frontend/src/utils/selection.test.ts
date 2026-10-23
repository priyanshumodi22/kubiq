import { describe, expect, it } from 'vitest';
import { addSelection, removeSelection } from './selection';
describe('controlled selection updates', () => {
  it('adds selections without mutating the original array', () => {
    const current = Object.freeze(['read']);
    expect(addSelection(current, 'write')).toEqual(['read', 'write']);
    expect(current).toEqual(['read']);
  });
  it('removes every matching entry and preserves the remaining order', () => {
    const current = Object.freeze(['read', 'write', 'read', 'audit']);
    expect(removeSelection(current, 'read')).toEqual(['write', 'audit']);
    expect(current).toHaveLength(4);
  });
});
