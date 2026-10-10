import type { KubiAvatarState } from './kubiAvatarState';

export function recordKubiStep(steps: KubiAvatarState[], state: KubiAvatarState): KubiAvatarState[] {
  const active = state === 'thinking' || state === 'searching' || state === 'working' || state === 'composing';
  return active && !steps.includes(state) ? [...steps, state] : steps;
}
