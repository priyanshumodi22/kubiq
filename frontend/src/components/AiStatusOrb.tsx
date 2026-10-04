import { Orb } from '@yogesharc/thinking-orbs';

type AiActivity = 'diagnosing' | 'searching' | 'thinking' | 'pro';

type AiStatusOrbProps = {
    activity: AiActivity;
    size?: 20 | 32 | 64;
    paused?: boolean;
    className?: string;
};

/**
 * The product's single semantic bridge to the official Thinking Orbs package.
 * Reasoning owns diagnostics and live model work; searching is used only for
 * log discovery. Variants deliberately keep Pro intelligence visually distinct.
 */
export function AiStatusOrb({ activity, size = 20, paused = false, className }: AiStatusOrbProps) {
    const sharedProps = {
        size,
        density: size >= 64 ? 1.35 : 1.1,
        dotSize: size >= 64 ? 0.9 : 1,
        paused,
    };

    if (activity === 'searching') {
        return <Orb state="searching" variant="lighthouse" className={`text-blue-200${className ? ` ${className}` : ''}`} {...sharedProps} />;
    }

    if (activity === 'thinking') {
        return <Orb state="reasoning" className={`text-cyan-100${className ? ` ${className}` : ''}`} {...sharedProps} />;
    }

    const tone = activity === 'diagnosing' ? 'text-sky-200' : 'text-blue-100';

    return (
        <Orb
            state="reasoning"
            variant="twins"
            className={`${tone}${className ? ` ${className}` : ''}`}
            {...sharedProps}
        />
    );
}
