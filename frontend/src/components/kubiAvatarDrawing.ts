import type { KubiAvatarState } from './kubiAvatarState';

export function avatarGazeTarget(state: KubiAvatarState, time: number): number {
  if (state === 'searching') return Math.sin(time * 1.8) * 9;
  return state === 'thinking' ? 4 : 0;
}

export function avatarRotation(state: KubiAvatarState, gaze: number): number {
  if (state === 'thinking') return -0.13;
  if (state === 'error') return 0.08;
  return state === 'searching' ? gaze * 0.008 : 0;
}

export function avatarFinShift(state: KubiAvatarState, time: number, animate: boolean): number {
  if (state === 'searching' && animate) return Math.sin(time * 2.4) * 14;
  if (state === 'working') return 10 + (animate ? Math.sin(time * 3) * 4 : 0);
  return 0;
}

export function avatarEyeHeight(state: KubiAvatarState, time: number, eye: number, animate: boolean, blinking: boolean): number {
  if (blinking) return 3;
  if (state === 'composing') {
    const movement = animate ? (Math.sin(time * 4 + eye * Math.PI) + 1) * 3.5 : eye * 7;
    return 12 + movement;
  }
  return state === 'thinking' && eye === 1 ? 13 : 19;
}

export function drawAvatarEyes(ctx: CanvasRenderingContext2D, state: KubiAvatarState, gaze: number, time: number, animate: boolean, blinking: boolean): void {
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (let eye = 0; eye < 2; eye++) {
    const x = 68 + eye * 32 + gaze;
    const y = state === 'thinking' ? 83 : 89;
    ctx.beginPath();
    if (state === 'finished' && !blinking) {
      ctx.moveTo(x, 93);
      ctx.quadraticCurveTo(x + 6, 83, x + 12, 93);
      ctx.stroke();
    } else {
      const height = avatarEyeHeight(state, time, eye, animate, blinking);
      ctx.roundRect(x, y + (19 - height) / 2, 12, height, Math.min(6, height / 2));
      ctx.fill();
    }
  }
}
