import { describe, expect, it } from 'vitest';
import { avatarEyeHeight, avatarFinShift, avatarGazeTarget, avatarRotation } from './kubiAvatarDrawing';
import { kubiAvatarStates } from './kubiAvatarState';

describe('avatar pose compatibility', () => {
  it('preserves every state pose with and without animation', () => {
    for (const state of Object.keys(kubiAvatarStates) as Array<keyof typeof kubiAvatarStates>) {
      for (const time of [0, 0.25, 1.5, 5]) {
        const gaze = state === 'searching' ? Math.sin(time * 1.8) * 9 : state === 'thinking' ? 4 : 0;
        expect(avatarGazeTarget(state, time)).toBe(gaze);
        const rotation = state === 'thinking' ? -0.13 : state === 'error' ? 0.08 : state === 'searching' ? gaze * 0.008 : 0;
        expect(avatarRotation(state, gaze)).toBe(rotation);
        for (const animate of [true, false]) {
          const fins = state === 'searching' && animate ? Math.sin(time * 2.4) * 14 : state === 'working' ? 10 + (animate ? Math.sin(time * 3) * 4 : 0) : 0;
          expect(avatarFinShift(state, time, animate)).toBe(fins);
          for (const eye of [0, 1]) {
            const height = state === 'composing' ? 12 + (animate ? (Math.sin(time * 4 + eye * Math.PI) + 1) * 3.5 : eye * 7) : state === 'thinking' && eye === 1 ? 13 : 19;
            expect(avatarEyeHeight(state, time, eye, animate, false)).toBe(height);
            expect(avatarEyeHeight(state, time, eye, animate, true)).toBe(3);
          }
        }
      }
    }
  });
});
