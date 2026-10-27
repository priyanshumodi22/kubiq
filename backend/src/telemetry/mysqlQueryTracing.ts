import { beginDatabaseSpan, databaseDetailsEnabled, queryDetails, type DatabaseSpan } from './databaseSpan';
type Callable = (...args: unknown[]) => unknown;
const wrapped = new WeakMap<object, object>();
const operations = new Set(['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'REPLACE', 'CALL', 'SHOW', 'EXPLAIN', 'WITH', 'SET', 'COMMIT', 'ROLLBACK', 'BEGIN', 'START']);
function responseAttributes(result: unknown): Record<string, string | number> {
    const rows = Array.isArray(result) ? result[0] : null;
    if (Array.isArray(rows) && !Array.isArray(rows[0])) return { 'db.response.returned_rows': rows.length };
    if (rows && typeof rows === 'object' && 'affectedRows' in rows && typeof rows.affectedRows === 'number') return { 'db.response.affected_rows': rows.affectedRows };
    return {};
}
function finish(span: DatabaseSpan | null, result: unknown, error?: unknown): void {
    try {
        span?.setAttributes(responseAttributes(result));
        if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^[A-Z_0-9]{1,80}$/.test(error.code)) span?.setAttributes({ 'db.response.status_code': error.code });
        span?.end(error);
    } catch { /* Never alter a business result because tracing failed. */ }
}
function statementDetails(args: unknown[], name: string) {
    const first = args[0];
    if (typeof first === 'string') return { statement: first, parameters: args[1] };
    if (first && typeof first === 'object' && 'sql' in first) return { statement: String(first.sql), parameters: args[1] ?? ('values' in first ? first.values : undefined) };
    return { statement: name === 'beginTransaction' ? 'START TRANSACTION' : name.toUpperCase() };
}
function prepareSpan(args: unknown[], name: string, metadata: () => Record<string, string | number>): DatabaseSpan | null {
    if (!databaseDetailsEnabled()) return null;
    let span: DatabaseSpan | null = null;
    try {
        const details = statementDetails(args, name);
        const token = details.statement.trimStart().slice(0, 32).split(/\s/, 1)[0].toUpperCase();
        const operation = operations.has(token) ? token : 'QUERY';
        const values = metadata();
        span = beginDatabaseSpan(String(values['db.system']) + '.' + operation, { ...values, 'db.operation.name': operation, 'code.namespace': 'mysql2.driver', 'code.function.name': name });
        span?.setAttributes({ 'db.query.text': queryDetails(details) });
        return span;
    } catch { finish(span, null); return null; }
}
function invoke(target: object, method: Callable, args: unknown[], name: string, metadata: () => Record<string, string | number>) {
    const span = prepareSpan(args, name, metadata);
    try {
        const result = Reflect.apply(method, target, args);
        if (result && typeof result === 'object' && 'then' in result && typeof result.then === 'function') return result.then((value: unknown) => { finish(span, value); return value; }, (error: unknown) => { finish(span, null, error); throw error; });
        finish(span, result);
        return result;
    } catch (error) { finish(span, null, error); throw error; }
}
function wrap<T extends object>(target: T, metadata: () => Record<string, string | number>): T {
    if (wrapped.has(target)) return wrapped.get(target) as T;
    const methods = new Map<PropertyKey, unknown>();
    const proxy = new Proxy(target, { get(original, key) {
        const value = Reflect.get(original, key, original);
        if (typeof value !== 'function') return value;
        if (!methods.has(key)) {
            if (['query', 'execute', 'beginTransaction', 'commit', 'rollback'].includes(String(key))) methods.set(key, (...args: unknown[]) => invoke(original, value as Callable, args, String(key), metadata));
            else if (key === 'getConnection') methods.set(key, async (...args: unknown[]) => wrap(await Reflect.apply(value, original, args), metadata));
            else methods.set(key, value.bind(original));
        }
        return methods.get(key);
    } });
    wrapped.set(target, proxy);
    return proxy;
}
/** Keep replacement/reconnected pools instrumented without modifying mysql2 global prototypes. */
export function instrumentMysqlRepository<T extends object>(repository: T, metadata: () => Record<string, string | number>): T {
    let pool = Reflect.get(repository, 'pool');
    if (pool) pool = wrap(pool, metadata);
    Object.defineProperty(repository, 'pool', { configurable: true, enumerable: true, get: () => pool, set: value => { pool = value ? wrap(value, metadata) : value; } });
    return repository;
}
