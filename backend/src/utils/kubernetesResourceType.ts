/** Sensitive Kubernetes resource matching shared by route-level authorization. */
export const isSecretResourceType = (value: unknown): boolean =>
  ['secret', 'secrets'].includes(String(value || '').trim().toLowerCase());
