import { expect, it } from 'vitest';
import { spanDetailGroups, spanKindLabel, spanTimestamp } from './spanDetailGroups';
import type { ISpan } from '../hooks/useTrace';
const fixture = { kind: 3, attributes: {} } as ISpan;
it('normalizes both current MongoDB and legacy MySQL attributes without discarding zero counts', () => {
    const mongo = spanDetailGroups({ ...fixture, attributes: { 'db.system.name': 'mongodb', 'db.namespace': 'kubiq', 'db.collection.name': 'users', 'db.operation.name': 'find', 'server.address': 'db.internal', 'server.port': 27017, 'code.namespace': 'kubiq.repositories.users' } });
    expect(mongo.database).toContainEqual({ label: 'Collection / table', value: 'users' });
    expect(mongo.repository).toBe(true);
    const mysql = spanDetailGroups({ ...fixture, attributes: { 'db.system': 'mysql', 'db.name': 'app', 'db.sql.table': 'orders', 'db.operation': 'SELECT', 'net.peer.name': 'sql.internal', 'net.peer.port': 3306, 'db.rows_affected': 0, 'db.rows_returned': 2, 'exception.type': 'DatabaseError' } });
    expect(mysql.database).toContainEqual({ label: 'Database', value: 'app' });
    expect(mysql.database).toContainEqual({ label: 'Collection / table', value: 'orders' });
    expect(mysql.database).toContainEqual({ label: 'Affected rows', value: '0' });
    expect(mysql.source).toContainEqual({ label: 'Error type', value: 'DatabaseError' });
});
it('shows HTTP context only on spans that report it, and never invents missing fields', () => {
    expect(spanDetailGroups(fixture)).toEqual({ database: [], http: [], source: [], repository: false });
    const groups = spanDetailGroups({ ...fixture, attributes: { 'http.method': 'GET', 'http.route': '/orders/:id', 'http.status_code': 200, 'code.function': 'read' } });
    expect(groups.http).toContainEqual({ label: 'Response status', value: '200' });
    expect(groups.source).toContainEqual({ label: 'Function', value: 'read' });
    expect(groups.database).toEqual([]);
});
it('labels numeric and named span kinds and handles missing timestamps honestly', () => {
    for (const [key, label] of [[1, 'Internal'], ['SPAN_KIND_SERVER', 'Server'], [3, 'Client'], [4, 'Producer'], [5, 'Consumer'], [undefined, 'Unspecified']]) expect(spanKindLabel(key)).toBe(label);
    expect(spanTimestamp(0)).toBe('1970-01-01T00:00:00.000Z');
    expect(spanTimestamp(Number.NaN)).toBe('Unavailable');
});
