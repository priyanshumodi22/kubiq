import { Orb } from '@yogesharc/thinking-orbs';

type AiActivity = 'diagnosing' | 'searching' | 'thinking' | 'working' | 'pro';

type AiStatusOrbProps = {
    activity: AiActivity;
    size?: number;
    className?: string;
};

/**
 * The product's single semantic bridge to the official Thinking Orbs package.
 * This keeps each visible AI state intentional: waiting for Pro, working for
 * modal headers, reasoning for analysis context, and lighthouse for search.
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
        return <Orb state="reasoning" className={`text-cyan-100${className ? ` ${className}` : ''}`} {...sharedProps} />;
    }

    if (activity === 'working') {
        return <Orb state="working" className={`text-sky-100${className ? ` ${className}` : ''}`} {...sharedProps} />;
    }

    if (activity === 'pro') {
        return <Orb state="waiting" className={`text-blue-100${className ? ` ${className}` : ''}`} {...sharedProps} />;
    }

    return (
        <Orb
            state="reasoning"
            className={`text-sky-200${className ? ` ${className}` : ''}`}
            {...sharedProps}
        />
    );
}
