const sensitiveKey = /password|passwd|secret|token|authorization|cookie|api[-_]?key|private[-_]?key|credential|connection[-_]?string/i;
interface RedactionMatcher { regex: RegExp; match: RegExpExecArray | null }

function earliestMatch(matchers: RedactionMatcher[]) {
  let first: RegExpExecArray | undefined;
  for (const { match } of matchers) {
    if (match && (!first || match.index < first.index)) first = match;
  }
  return first;
}

function redactText(value: string): string {
  const matchers = [
    /(bearer\s+)[a-z0-9._-]+/ig,
    /(?:mongodb(?:\+srv)?|mysql):\/\/[^\s]+/ig,
    /(?:api[_-]?key|token|secret)\s*[=:]\s*[^\s,;]+/ig,
  ].map(regex => ({ regex, match: regex.exec(value) }));
  const parts: string[] = [];
  let cursor = 0;
  let next = earliestMatch(matchers);
  while (next) {
    parts.push(value.slice(cursor, next.index), next[1] || '', '[REDACTED]');
    cursor = next.index + next[0].length;
    // Retain future matches (and exhausted patterns) rather than rescanning
    // the remaining suffix for every match. Equal-start ties keep rule order.
    for (const matcher of matchers) {
      if (matcher.match && matcher.match.index < cursor) {
        matcher.regex.lastIndex = cursor;
        matcher.match = matcher.regex.exec(value);
      }
    }
    next = earliestMatch(matchers);
  }
  parts.push(value.slice(cursor));
  return parts.join('');
}

export const redactKubiValue = (value: any, depth = 0): any => {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[TRUNCATED]';
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.slice(0, 50).map(item => redactKubiValue(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : redactKubiValue(item, depth + 1)]));
  }
  return value;
};

export const sanitizeKubiContent = (value: string): string => redactKubiValue(value).slice(0, 4000);
