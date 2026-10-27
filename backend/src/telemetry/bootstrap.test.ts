import { expect, jest, test } from '@jest/globals';
import { startTracing } from 'kubiq-apm/runtime';
import { tracing } from './bootstrap';
jest.mock('kubiq-apm/runtime', () => ({ startTracing: jest.fn(() => ({ enabled: false })) }));
test('preload uses the fixed backend identity while leaving enablement to the opt-in runtime', () => {
    expect(startTracing).toHaveBeenCalledWith({ profile: 'kubiq', serviceName: 'kubiq-backend' });
    expect(tracing.enabled).toBe(false);
});
