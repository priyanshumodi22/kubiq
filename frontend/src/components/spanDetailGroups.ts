import type { ISpan } from '../hooks/useTrace';
export type SpanDetailField = { label: string; value: string };
function field(attributes: Record<string, unknown>, label: string, ...keys: string[]): SpanDetailField[] {
    for (const key of keys) {
        const value = attributes[key];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [{ label, value: String(value) }];
    }
    return [];
}
export function spanKindLabel(kind: unknown): string {
    const key = String(kind).replace('SPAN_KIND_', '').toUpperCase();
    const kinds: Readonly<Record<string, string>> = { '1': 'Internal', INTERNAL: 'Internal', '2': 'Server', SERVER: 'Server', '3': 'Client', CLIENT: 'Client', '4': 'Producer', PRODUCER: 'Producer', '5': 'Consumer', CONSUMER: 'Consumer' };
    return kinds[key] || 'Unspecified';
}
export function spanDetailGroups(span: ISpan) {
    const a = span.attributes || {};
    const database = [
        ...field(a, 'System', 'db.system.name', 'db.system'),
        ...field(a, 'Database', 'db.namespace', 'db.name', 'db.instance'),
        ...field(a, 'Collection / table', 'db.collection.name', 'db.mongodb.collection', 'db.sql.table'),
        ...field(a, 'Operation', 'db.operation.name', 'db.operation'),
        ...field(a, 'Server', 'server.address', 'net.peer.name', 'peer.hostname', 'net.peer.ip'),
        ...field(a, 'Port', 'server.port', 'net.peer.port'),
        ...field(a, 'Returned rows', 'db.response.returned_rows', 'db.rows_returned'),
        ...field(a, 'Affected rows', 'db.response.affected_rows', 'db.rows_affected'),
    ];
    const http = [
        ...field(a, 'Method', 'http.request.method', 'http.method'),
        ...field(a, 'Route', 'http.route'),
        ...field(a, 'Response status', 'http.response.status_code', 'http.status_code'),
        ...field(a, 'Server', 'server.address', 'net.peer.name'),
        ...field(a, 'Port', 'server.port', 'net.peer.port'),
    ];
    const source = [...field(a, 'Namespace', 'code.namespace'), ...field(a, 'Function', 'code.function.name', 'code.function'), ...field(a, 'Error type', 'error.type', 'exception.type')];
    const repository = typeof a['code.namespace'] === 'string' && a['code.namespace'].startsWith('kubiq.repositories.');
    return { database: a['db.system.name'] || a['db.system'] ? database : [], http: a['http.request.method'] || a['http.method'] ? http : [], source, repository };
}
export function spanTimestamp(nanoseconds: number): string {
    const date = new Date(Number(nanoseconds) / 1e6);
    return Number.isFinite(date.getTime()) ? date.toISOString() : 'Unavailable';
}
