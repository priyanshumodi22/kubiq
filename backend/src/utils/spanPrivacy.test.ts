import { expect, jest, test } from '@jest/globals';
import { privateSpanAttributes } from './spanPrivacy';
jest.mock('../telemetry/databaseSpan', () => ({ queryDetails: jest.requireActual<{ databaseQueryDetails: (value: unknown) => string }>('../../../kubiq-apm/node/runtime-query').databaseQueryDetails }));
test('preserves useful SQL and Mongo details while redacting passwords before storage or delivery', () => {
    const attributes = { 'db.system': 'mysql', 'db.statement': 'SELECT * FROM orders WHERE id = ?', 'server.port': 3306, 'http.request.header.authorization': 'PRIVATE_TOKEN' };
    const safe = privateSpanAttributes(attributes);
    expect(safe['db.statement']).toBe(attributes['db.statement']);
    expect(safe['server.port']).toBe(3306);
    expect(safe['http.request.header.authorization']).toBe('[REDACTED]');
    expect(attributes['http.request.header.authorization']).toBe('PRIVATE_TOKEN');
    const mongo = privateSpanAttributes({ 'db.query.text': JSON.stringify({ find: 'users', filter: { password: 'PRIVATE_PASSWORD', username: 'alice' } }) });
    expect(JSON.stringify(mongo)).toContain('alice');
    expect(JSON.stringify(mongo)).not.toContain('PRIVATE_PASSWORD');
    expect(JSON.stringify(privateSpanAttributes({ 'db.statement': "UPDATE users SET password = 'PRIVATE_PASSWORD'" }))).not.toContain('PRIVATE_PASSWORD');
});
test('handles structured legacy attributes, separate bind arrays and unavailable query text without mutation', () => {
    expect(privateSpanAttributes()).toEqual({});
    const structured = privateSpanAttributes({ 'db.statement': { find: 'users', filter: { pwd: 'PRIVATE' } }, 'db.statement.parameters': ['PRIVATE'], retries: 0 });
    expect(JSON.stringify(structured)).not.toContain('PRIVATE');
    expect(structured.retries).toBe(0);
    expect(privateSpanAttributes({ 'db.statement': 'SELECT /* invalid' })['db.statement']).toBe('[QUERY UNAVAILABLE]');
});
