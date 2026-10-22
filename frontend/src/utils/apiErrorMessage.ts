import { isAxiosError } from 'axios';

/** Only display a server's explicit text message; never stringify arbitrary payloads. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!isAxiosError<{ message?: unknown }>(error)) return fallback;
  const message = error.response?.data?.message;
  return typeof message === 'string' && message.length > 0 ? message : fallback;
}
