import { describe, expect, it } from '@jest/globals';
import { sanitizeKubiContent } from '../utils/kubiSanitizer';

describe('sanitizeKubiContent', () => {
  it('redacts common credential formats before kubi stores or forwards a question', () => {
    const sanitized = sanitizeKubiContent('Check this token=super-secret-value and Bearer abc.def_123');

    expect(sanitized).toContain('[REDACTED]');
    expect(sanitized).not.toContain('super-secret-value');
    expect(sanitized).not.toContain('abc.def_123');
  });

  it('bounds stored question content', () => {
    expect(sanitizeKubiContent('a'.repeat(5000))).toHaveLength(4000);
  });
});
