import { RbacRoleService } from '../services/RbacRoleService';

/** Do not send connection credentials to roles without database observability access. */
export const maskServiceEndpoint = async (service: any, user: any) => {
  const type = service.type?.toLowerCase();
  if (!['mongodb', 'mysql', 'mariadb'].includes(type)) return service;
  return await RbacRoleService.hasPermission(user || {}, 'database.read') ? service : { ...service, endpoint: '*****' };
};
