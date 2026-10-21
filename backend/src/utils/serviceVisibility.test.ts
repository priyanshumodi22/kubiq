import { describe, expect, test } from '@jest/globals';
import { withoutRawLogConfig } from './serviceVisibility';

describe('raw log configuration projection', () => {
  test('removes restricted paths without changing monitor state or unrelated fields', () => {
    const service = { name: 'orders', logPath: '/private/app.log', logSources: [{ path: '/secret.log' }], history: [1] };
    expect(withoutRawLogConfig(service)).toEqual({ name: 'orders', history: [1] });
    expect(service.logPath).toBe('/private/app.log');
    expect(service.logSources).toHaveLength(1);
  });
});
