type SecretResource = {
  data?: Record<string, unknown>;
  stringData?: Record<string, unknown>;
  metadata?: { annotations?: Record<string, string> };
};

const redactValues = (values: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.keys(values).map(key => [key, '***REDACTED***']));

/** Keep Secret structure useful to the UI without returning credential values. */
export function redactKubernetesSecret<T extends SecretResource>(secret: T): T {
  const result = { ...secret, data: redactValues(secret.data ?? {}) };
  if (secret.stringData) result.stringData = redactValues(secret.stringData);
  if (secret.metadata?.annotations) {
    const annotations = { ...secret.metadata.annotations };
    delete annotations['kubectl.kubernetes.io/last-applied-configuration'];
    result.metadata = { ...secret.metadata, annotations };
  }
  return result;
}
