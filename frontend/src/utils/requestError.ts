function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Preserve transport error precedence while keeping arbitrary payloads out of React text. */
export function requestErrorMessage(error: unknown, fallback: string, field: 'message' | 'error' | 'error-or-message' = 'message'): string {
  const failure = record(error);
  const response = record(failure?.response);
  const data = record(response?.data);
  const serverMessage = field === 'error-or-message' ? text(data?.error) || text(data?.message) : text(data?.[field]);
  return serverMessage || text(failure?.message) || fallback;
}

export function requestErrorStatus(error: unknown): number | undefined {
  const status = record(record(error)?.response)?.status;
  return typeof status === 'number' ? status : undefined;
}

export function requestServerErrorMessage(error: unknown, fallback: string): string {
  return text(record(record(record(error)?.response)?.data)?.message) || fallback;
}
