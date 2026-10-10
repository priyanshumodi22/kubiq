import { describe, expect, it } from 'vitest';
import { recordKubiStep } from './kubiActivityState';
import type { KubiAvatarState } from './kubiAvatarState';

describe('kubi investigation trail', () => {
  it('retains fast real stages in arrival order', () => {
    const events: KubiAvatarState[] = ['thinking', 'searching', 'working', 'composing', 'finished'];
    expect(events.reduce(recordKubiStep, [])).toEqual(events.slice(0, 4));
  });
  it('does not duplicate streaming stages', () => {
    const steps: KubiAvatarState[] = ['thinking', 'composing'];
    expect(recordKubiStep(steps, 'composing')).toBe(steps);
  });
  it('does not invent unvisited stages after an error', () => {
    expect(recordKubiStep(['thinking'], 'error')).toEqual(['thinking']);
    expect(recordKubiStep([], 'idle')).toEqual([]);
  });
});
