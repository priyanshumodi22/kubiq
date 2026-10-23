import { Check, Circle, LoaderCircle } from 'lucide-react';
import { KubiAvatar } from './KubiAvatar';
import { kubiAvatarStates, type KubiAvatarState } from './kubiAvatarState';

const investigationSteps = [
  { state: 'thinking', label: 'Understand' },
  { state: 'searching', label: 'Find evidence' },
  { state: 'working', label: 'Connect' },
  { state: 'composing', label: 'Answer' },
] as const;

export function KubiActivity({ state, steps, phase }: Readonly<{ state: KubiAvatarState; steps: KubiAvatarState[]; phase: string | null }>) {
  const active = Boolean(phase);
  let caption = 'Investigation complete';
  if (active) caption = 'Investigation in progress';
  else if (state === 'error') caption = 'Investigation interrupted';
  return <section className="kubi-activity" aria-label="Investigation progress" data-state={state}>
    <div className="kubi-activity-heading">
      <KubiAvatar state={state} size={80} />
      <div><span className="kubi-caption">{caption}</span>
        <p role="status" aria-live="polite">{phase || kubiAvatarStates[state].label}</p></div>
    </div>
    <ol className="kubi-steps">{investigationSteps.map(step => {
      const visited = steps.includes(step.state);
      const current = active && state === step.state;
      const inactiveIcon = visited ? Check : Circle;
      const Icon = current ? LoaderCircle : inactiveIcon;
      const inactiveLabel = visited ? ': visited' : ': not reached';
      const progressLabel = current ? ': in progress' : inactiveLabel;
      return <li key={step.state} data-visited={visited} aria-current={current ? 'step' : undefined}>
        <Icon size={14} className={current ? 'kubi-spin' : ''} aria-hidden="true" /><span>{step.label}</span>
        <span className="sr-only">{progressLabel}</span>
      </li>;
    })}</ol>
  </section>;
}
