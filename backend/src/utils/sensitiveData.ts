import { RbacRoleService } from '../services/RbacRoleService';

// A UI placeholder, never a connection credential.
export const ENDPOINT_MASK = '*****';

function redactAuthority(endpoint: string): string {
  const schemeEnd = endpoint.indexOf('://');
  if (schemeEnd < 0) return endpoint;
  const start = schemeEnd + 3;
  let end = endpoint.length;
  for (const delimiter of ['/', '?', '#']) {
    const position = endpoint.indexOf(delimiter, start);
    if (position >= 0) end = Math.min(end, position);
  }
  const authority = endpoint.slice(start, end);
  const at = authority.lastIndexOf('@');
  const colon = authority.indexOf(':');
  if (at < 0 || colon < 0 || colon > at) return endpoint;
  return endpoint.slice(0, start + colon + 1) + ENDPOINT_MASK + endpoint.slice(start + at);
}

function redactQueryPart(part: string): string {
  const equals = part.indexOf('=');
  if (equals < 0) return part;
  let key: string;
  try { key = decodeURIComponent(part.slice(0, equals).replaceAll('+', ' ')).toLowerCase(); }
  catch { return part; }
  return ['password', 'passwd', 'pwd', 'pass'].includes(key)
    ? part.slice(0, equals + 1) + ENDPOINT_MASK : part;
}

/** Preserve connection spelling (including MongoDB seed lists), never its password.
 * Authority and query parsing use bounded string scans rather than overlapping regexes.
 */
export function redactEndpointPassword(endpoint: string): string {
  const redacted = redactAuthority(endpoint);
  const query = redacted.indexOf('?');
  const fragment = redacted.indexOf('#');
  if (query < 0 || (fragment >= 0 && fragment < query)) return redacted;
  const end = fragment < 0 ? redacted.length : fragment;
  const parts = redacted.slice(query + 1, end).split('&').map(redactQueryPart);
  return redacted.slice(0, query + 1) + parts.join('&') + redacted.slice(end);
}

/** An unchanged redacted form preserves the stored credential. Never persist a display mask. */
export function resolveEndpointUpdate(endpoint: string, stored: string): string {
  if (endpoint === redactEndpointPassword(stored)) return stored;
  if (endpoint.includes(ENDPOINT_MASK)) {
    throw new Error('Enter the complete connection endpoint, including its password, when changing a redacted endpoint.');
  }
  return endpoint;
}

/** Database visibility is permission-gated; passwords are hidden for every role. */
export const maskServiceEndpoint = async (service: any, user: any) => {
  const type = service.type?.toLowerCase();
  if (['mongodb', 'mysql', 'mariadb'].includes(type)
    && !await RbacRoleService.hasPermission(user || {}, 'database.read')) return { ...service, endpoint: '*****' };
  return { ...service, endpoint: redactEndpointPassword(service.endpoint) };
};
