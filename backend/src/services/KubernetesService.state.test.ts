import { describe, expect, it } from '@jest/globals';
import { getContainerState } from '../utils/kubernetesContainerState';

describe('Kubernetes container state mapping', () => {
    it('preserves running, waiting, terminated and absent states', () => {
        expect(getContainerState({ running: {} })).toBe('running');
        expect(getContainerState({ waiting: { reason: 'CrashLoopBackOff' } })).toBe('waiting');
        expect(getContainerState({ terminated: { exitCode: 1 } })).toBe('terminated');
        expect(getContainerState({})).toBe('unknown');
        expect(getContainerState()).toBe('unknown');
    });

    it('preserves existing precedence if malformed input contains several states', () => {
        expect(getContainerState({ running: {}, waiting: {}, terminated: { exitCode: 0 } })).toBe('running');
        expect(getContainerState({ waiting: {}, terminated: { exitCode: 0 } })).toBe('waiting');
    });
});
