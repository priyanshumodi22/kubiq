import { Check, Circle, LoaderCircle } from 'lucide-react';
import { KubiAvatar } from './KubiAvatar';
import { kubiAvatarStates, type KubiAvatarState } from './kubiAvatarState';

const investigationSteps = [
  { state: 'thinking', label: 'Understand' },
  { state: 'searching', label: 'Find evidence' },
  { state: 'working', label: 'Connect' },
  { state: 'composing', label: 'Answer' },
] as const;

export function KubiActivity({ state, steps, phase }: { state: KubiAvatarState; steps: KubiAvatarState[]; phase: string | null }) {
  const active = Boolean(phase);
  return <section className="kubi-activity" aria-label="Investigation progress" data-state={state}>
    <div className="kubi-activity-heading">
      <KubiAvatar state={state} size={80} />
      <div><span className="kubi-caption">{active ? 'Investigation in progress' : state === 'error' ? 'Investigation interrupted' : 'Investigation complete'}</span>
        <p role="status" aria-live="polite">{phase || kubiAvatarStates[state].label}</p></div>
    </div>
    <ol className="kubi-steps">{investigationSteps.map(step => {
      const visited = steps.includes(step.state);
      const current = active && state === step.state;
      const Icon = current ? LoaderCircle : visited ? Check : Circle;
      return <li key={step.state} data-visited={visited} aria-current={current ? 'step' : undefined}>
        <Icon size={14} className={current ? 'kubi-spin' : ''} aria-hidden="true" /><span>{step.label}</span>
        <span className="sr-only">{current ? ': in progress' : visited ? ': visited' : ': not reached'}</span>
      </li>;
    })}</ol>
  </section>;
}
