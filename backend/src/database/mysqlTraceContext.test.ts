import { expect, jest, test } from '@jest/globals';
import { mysqlTraceContext } from './mysqlTraceContext';
import { traceRepository, type DependencyTracer } from './traceRepository';
test('SQL metadata uses the actual resolved pool target and excludes credentials', () => {
    const repository = { pool: { pool: { config: { connectionConfig: { host: 'sql.internal', port: 3306, database: 'actual_database', password: 'SYNTHETIC_SECRET', user: 'SYNTHETIC_SECRET' } } } }, read() { return this.pool; } };
    const context = mysqlTraceContext(repository, 'users', 'read', 'mysql');
    expect(context).toEqual({ 'db.system.name': 'mysql', 'code.namespace': 'kubiq.repositories.users', 'code.function.name': 'read', 'server.address': 'sql.internal', 'server.port': 3306, 'db.namespace': 'actual_database' });
    const trace = jest.fn<DependencyTracer>().mockImplementation((_, action) => action()) as DependencyTracer;
    const wrapped = traceRepository(repository, 'users', trace, operation => mysqlTraceContext(repository, 'users', operation, 'mysql'), 'mysql');
    expect(wrapped.read()).toBe(repository.pool);
    expect(trace).toHaveBeenCalledWith('mysql.users.read', expect.any(Function), { ...context, 'db.system': 'mysql', 'db.operation.name': 'read' });
});
test('MariaDB retains its engine identity and unknown targets remain absent', () => {
    expect(mysqlTraceContext({}, 'system', 'read', 'mariadb')).toEqual({ 'db.system.name': 'mariadb', 'code.namespace': 'kubiq.repositories.system', 'code.function.name': 'read' });
    expect(mysqlTraceContext({ pool: { pool: { config: { connectionConfig: {} } } } }, 'users', 'read', 'mysql')).not.toHaveProperty('server.address');
});
