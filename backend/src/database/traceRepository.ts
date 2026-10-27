export type DependencyTracer = <T>(name: string, action: () => T, attributes: Record<string, string>) => T;
const lifecycleMethods = new Set(['initialize', 'close', 'connect', 'disconnect', 'insertSpans', 'insertLogs']);

/** Wrap public repository operations without replacing their owning `this`. */
export function traceRepository<T extends object>(repository: T, collection: string, trace: DependencyTracer): T {
    const methods = new Map<string, unknown>();
    return new Proxy(repository, {
        get(target, property) {
            const value = Reflect.get(target, property, target);
            if (typeof property !== 'string' || typeof value !== 'function') return value;
            if (!methods.has(property)) {
                const bound = (...args: unknown[]) => Reflect.apply(value, target, args);
                const operation = /^[a-zA-Z][a-zA-Z0-9]{0,60}$/.test(property) ? property : 'operation';
                methods.set(property, lifecycleMethods.has(property) ? bound : (...args: unknown[]) => trace(
                    'mongodb.' + collection + '.' + operation,
                    () => bound(...args),
                    { 'db.system': 'mongodb', 'db.operation.name': operation },
                ));
            }
            return methods.get(property);
        },
    });
}
