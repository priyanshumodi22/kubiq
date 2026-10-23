import { describe, expect, it } from '@jest/globals';
import { isSecretResourceType } from '../utils/kubernetesResourceType';

describe('Kubernetes sensitive-resource classification', () => {
  it('covers singular and plural Secret resource paths', () => {
    expect(isSecretResourceType('secret')).toBe(true);
    expect(isSecretResourceType('secrets')).toBe(true);
    expect(isSecretResourceType('ConfigMap')).toBe(false);
  });
  it('normalizes actual resource paths without coercing malformed values', () => {
    expect(isSecretResourceType(' SECRETS ')).toBe(true);
    for (const value of [undefined, null, 42, {}, ['secrets'], Object.create(null)]) {
      expect(isSecretResourceType(value)).toBe(false);
    }
  });
});
