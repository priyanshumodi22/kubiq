function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Preserve transport error precedence while keeping arbitrary payloads out of React text. */
export function requestErrorMessage(error: unknown, fallback: string, field: 'message' | 'error' = 'message'): string {
  const failure = record(error);
  const response = record(failure?.response);
  return text(record(response?.data)?.[field]) || text(failure?.message) || fallback;
}

export function requestErrorStatus(error: unknown): number | undefined {
  const status = record(record(error)?.response)?.status;
  return typeof status === 'number' ? status : undefined;
}
