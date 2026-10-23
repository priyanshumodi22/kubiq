/** Sensitive Kubernetes resource matching shared by route-level authorization. */
export const isSecretResourceType = (value: unknown): boolean =>
  typeof value === 'string' && ['secret', 'secrets'].includes(value.trim().toLowerCase());
