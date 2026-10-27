interface PoolMetadata { pool?: { config?: { connectionConfig?: { host?: string; port?: number; database?: string } } } }
/** Read resolved mysql2 pool target facts, never its password, URI or statement values. */
export function mysqlTraceContext(repository: object, name: string, operation: string, system: string): Record<string, string | number> {
    const pool = Reflect.get(repository, 'pool') as PoolMetadata | undefined;
    const target = pool?.pool?.config?.connectionConfig;
    const values: Record<string, string | number> = { 'db.system.name': system, 'code.namespace': 'kubiq.repositories.' + name, 'code.function.name': operation };
    if (target?.host) values['server.address'] = target.host;
    if (target?.port) values['server.port'] = target.port;
    if (target?.database) values['db.namespace'] = target.database;
    return values;
}
