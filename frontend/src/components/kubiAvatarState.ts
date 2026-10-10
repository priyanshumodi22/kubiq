export const kubiAvatarStates = {
  idle: { color: '#70bcff', label: 'Ready to help' },
  thinking: { color: '#9dbaff', label: 'Understanding your question' },
  searching: { color: '#64d9f0', label: 'Finding permitted evidence' },
  working: { color: '#70bcff', label: 'Connecting the evidence' },
  composing: { color: '#22d3ee', label: 'Writing the answer' },
  finished: { color: '#34d399', label: 'Answer complete' },
  error: { color: '#f4505e', label: 'Needs your attention' },
} as const;

export type KubiAvatarState = keyof typeof kubiAvatarStates;

/** State comes from the protocol, never from translated display labels. */
export function kubiStateForEvent(current: KubiAvatarState, event: string, state?: unknown): KubiAvatarState {
  if (event === 'error') return 'error';
  if (event === 'done') return current === 'error' ? 'error' : 'finished';
  if (current === 'error') return current;
  if (event === 'answer_delta') return 'composing';
  if (event === 'status' && typeof state === 'string' && Object.prototype.hasOwnProperty.call(kubiAvatarStates, state)) {
    return state as KubiAvatarState;
  }
  return current;
}
