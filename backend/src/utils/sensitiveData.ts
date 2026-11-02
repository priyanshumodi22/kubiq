import { RbacRoleService } from '../services/RbacRoleService';

export const REDACTED_PASSWORD = '*****';

/** Preserve connection identity and spelling (including MongoDB seed lists), never its password. */
export function redactEndpointPassword(endpoint: string): string {
  return endpoint.replace(/^(\w[\w+.-]*:\/\/)([^/?#]*)(.*)$/s, (_match, scheme: string, authority: string, suffix: string) => {
    const at = authority.lastIndexOf('@');
    const colon = authority.slice(0, at).indexOf(':');
    return at >= 0 && colon >= 0
      ? `${scheme}${authority.slice(0, colon + 1)}${REDACTED_PASSWORD}${authority.slice(at)}${suffix}`
      : `${scheme}${authority}${suffix}`;
  }).replace(/([?&](?:password|passwd|pwd|pass)=)[^&#]*/gi, `$1${REDACTED_PASSWORD}`);
}

/** An unchanged redacted form preserves the stored credential. Never persist a display mask. */
export function resolveEndpointUpdate(endpoint: string, stored: string): string {
  if (endpoint === redactEndpointPassword(stored)) return stored;
  if (endpoint.includes(REDACTED_PASSWORD)) {
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
