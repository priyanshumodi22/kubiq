import { Orb } from '@yogesharc/thinking-orbs';

type AiActivity = 'diagnosing' | 'searching' | 'thinking' | 'pro' | 'complete';

type AiStatusOrbProps = {
    activity: AiActivity;
    size?: 20 | 32 | 64;
    className?: string;
};

/**
 * The product's single semantic bridge to the official Thinking Orbs package.
 * Reasoning owns diagnostics and live model work; searching is used only for
 * log discovery. Variants deliberately keep Pro intelligence visually distinct.
 */
export function AiStatusOrb({ activity, size = 20, className }: AiStatusOrbProps) {
    const sharedProps = {
        size,
        density: size >= 64 ? 1.35 : 1.1,
        dotSize: size >= 64 ? 0.9 : 1,
    };

    if (activity === 'searching') {
        return <Orb state="searching" variant="lighthouse" className={`text-blue-200${className ? ` ${className}` : ''}`} {...sharedProps} />;
    }

    if (activity === 'thinking') {
        return <Orb state="working" variant="gyro" className={`text-cyan-100${className ? ` ${className}` : ''}`} {...sharedProps} />;
    }

    if (activity === 'pro') {
        return <Orb state="background" variant="spiral" className={`text-blue-100${className ? ` ${className}` : ''}`} {...sharedProps} />;
    }

    if (activity === 'complete') {
        return <Orb state="compacting" variant="fuse" className={`text-emerald-100${className ? ` ${className}` : ''}`} {...sharedProps} />;
    }

    return (
        <Orb
            state="reasoning"
            variant="twins"
            className={`text-sky-200${className ? ` ${className}` : ''}`}
            {...sharedProps}
        />
    );
}
