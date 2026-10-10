import { describe, expect, it } from 'vitest';
import { kubiAvatarStates, kubiStateForEvent } from './kubiAvatarState';

describe('kubi avatar protocol states', () => {
  it.each(Object.keys(kubiAvatarStates))('accepts the explicit %s state', state => {
    expect(kubiStateForEvent('thinking', 'status', state)).toBe(state);
  });
  it('does not interpret labels or inherited object properties as states', () => {
    for (const state of ['Looking through logs', 'toString', '__proto__', null, 42]) {
      expect(kubiStateForEvent('searching', 'status', state)).toBe('searching');
    }
  });
  it('switches to composing on answer text and finishes on done', () => {
    expect(kubiStateForEvent('working', 'answer_delta')).toBe('composing');
    expect(kubiStateForEvent('composing', 'done')).toBe('finished');
  });
  it('retains failure if a terminal event follows an error', () => {
    expect(kubiStateForEvent('working', 'error')).toBe('error');
    expect(kubiStateForEvent('error', 'done')).toBe('error');
    expect(kubiStateForEvent('error', 'answer_delta')).toBe('error');
  });
});
