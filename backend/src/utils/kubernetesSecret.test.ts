import { describe, expect, it } from '@jest/globals';
import { redactKubernetesSecret } from './kubernetesSecret';

describe('Kubernetes Secret redaction', () => {
  it('redacts both encoded and plain values and strips last-applied credentials', () => {
    const secret = {
      kind: 'Secret',
      data: { password: 'ZW5jb2RlZA==' },
      stringData: { token: 'plain-token' },
      metadata: { name: 'database', annotations: { owner: 'ops', 'kubectl.kubernetes.io/last-applied-configuration': '{"data":{"password":"secret"}}' } },
    };
    const result = redactKubernetesSecret(secret);
    expect(result).toEqual({ kind: 'Secret', data: { password: '***REDACTED***' }, stringData: { token: '***REDACTED***' }, metadata: { name: 'database', annotations: { owner: 'ops' } } });
    expect(secret.data.password).toBe('ZW5jb2RlZA==');
    expect(secret.metadata.annotations).toHaveProperty(['kubectl.kubernetes.io/last-applied-configuration']);
  });

  it('supports an empty Secret without metadata or values', () => {
    expect(redactKubernetesSecret({})).toEqual({ data: {} });
  });
});
