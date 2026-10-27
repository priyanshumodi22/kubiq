import { afterEach, expect, jest, test } from '@jest/globals';
import { beginDatabaseSpan, databaseDetailsEnabled, queryDetails } from './databaseSpan';
jest.mock('kubiq-apm/runtime', () => ({ beginDependency: jest.fn(), databaseQueryDetails: jest.fn() }));
const runtime = jest.requireMock('kubiq-apm/runtime') as { beginDependency?: jest.Mock; databaseQueryDetails?: jest.Mock };
const saved = { ...runtime };
const enabled = process.env.KUBIQ_TRACING_ENABLED, details = process.env.KUBIQ_TRACING_QUERY_DETAILS;
afterEach(() => {
    Object.assign(runtime, saved);
    if (enabled === undefined) delete process.env.KUBIQ_TRACING_ENABLED; else process.env.KUBIQ_TRACING_ENABLED = enabled;
    if (details === undefined) delete process.env.KUBIQ_TRACING_QUERY_DETAILS; else process.env.KUBIQ_TRACING_QUERY_DETAILS = details;
});
test('delegates only to the explicit runtime API and handles an older runtime without exposing raw data', () => {
    const handle = { setAttributes: jest.fn(), end: jest.fn() };
    runtime.beginDependency?.mockReturnValue(handle);
    runtime.databaseQueryDetails?.mockReturnValue('MASKED');
    expect(beginDatabaseSpan('mysql.SELECT', { 'db.system': 'mysql' })).toBe(handle);
    expect(queryDetails({ password: 'PRIVATE' })).toBe('MASKED');
    delete runtime.beginDependency; delete runtime.databaseQueryDetails;
    expect(beginDatabaseSpan('mysql.SELECT', {})).toBeNull();
    expect(queryDetails({ password: 'PRIVATE' })).toBe('[QUERY DETAILS UNAVAILABLE]');
});
test('requires both tracing and query-detail flags', () => {
    delete process.env.KUBIQ_TRACING_ENABLED; delete process.env.KUBIQ_TRACING_QUERY_DETAILS;
    expect(databaseDetailsEnabled()).toBe(false);
    process.env.KUBIQ_TRACING_ENABLED = 'true'; expect(databaseDetailsEnabled()).toBe(false);
    process.env.KUBIQ_TRACING_QUERY_DETAILS = 'true'; expect(databaseDetailsEnabled()).toBe(true);
});
