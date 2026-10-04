import { ThinkingOrb } from 'thinking-orbs';

type AiActivity = 'diagnosing' | 'searching' | 'thinking' | 'pro';

type AiStatusOrbProps = {
    activity: AiActivity;
    size?: 20 | 32 | 64;
    paused?: boolean;
    className?: string;
};

const ORB_BY_ACTIVITY = {
    diagnosing: { state: 'solving', color: '#7dd3fc' },
    searching: { state: 'searching', color: '#93c5fd' },
    thinking: { state: 'breathing', color: '#bfdbfe' },
    pro: { state: 'solving', color: '#dbeafe' },
} as const;

/**
 * The product's single semantic bridge to Thinking Orbs.
 * Keep the animation tied to real AI work: diagnostics solve, retrieval
 * searches, and an in-flight summary thinks.
 */
export function AiStatusOrb({ activity, size = 20, paused = false, className }: AiStatusOrbProps) {
    const orb = ORB_BY_ACTIVITY[activity];

    return (
        <ThinkingOrb
            state={orb.state}
            size={size}
            theme="dark"
            color={orb.color}
            paused={paused}
            className={className}
            aria-hidden="true"
        />
    );
}
