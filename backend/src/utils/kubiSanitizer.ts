const sensitiveKey = /password|passwd|secret|token|authorization|cookie|api[-_]?key|private[-_]?key|credential|connection[-_]?string/i;
const sensitiveValue = /(bearer\s+)[a-z0-9._-]+|(?:mongodb(?:\+srv)?|mysql):\/\/[^\s]+|(?:api[_-]?key|token|secret)\s*[=:]\s*[^\s,;]+/ig;

export const redactKubiValue = (value: any, depth = 0): any => {
  if (depth > 6 || value === null || value === undefined) return value;
  if (typeof value === 'string') return value.replace(sensitiveValue, '$1[REDACTED]');
  if (Array.isArray(value)) return value.slice(0, 50).map(item => redactKubiValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : redactKubiValue(item, depth + 1)]));
  }
  return value;
};

export const sanitizeKubiContent = (value: string): string => redactKubiValue(value).slice(0, 4000);
