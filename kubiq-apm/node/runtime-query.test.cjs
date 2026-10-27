const { test } = require('node:test');
const assert = require('node:assert/strict');
const { databaseQueryDetails: capture } = require('./runtime-query');
test('MongoDB query values remain useful while nested passwords and tokens are redacted', () => {
    const value = capture({ find: 'users', filter: { username: 'alice', password_hash: 'PRIVATE_PASSWORD', nested: { apiKey: 'PRIVATE_KEY' } }, limit: 0, enabled: false, lsid: 'PRIVATE_SESSION' });
    assert(value.includes('alice')); assert(value.includes('"limit":0')); assert(value.includes('false'));
    for (const secret of ['PRIVATE_PASSWORD', 'PRIVATE_KEY', 'PRIVATE_SESSION']) assert(!value.includes(secret));
    assert(value.includes('[REDACTED]'));
    assert(!capture({ update: 'systempreferences', updates: [{ u: { $set: { value: 'PRIVATE_ENCRYPTED' } } }] }).includes('PRIVATE_ENCRYPTED'));
});
test('SQL and ordinary bound parameters remain visible; credential-related statements fail closed', () => {
    assert(capture({ statement: 'SELECT * FROM users WHERE username = ?', parameters: ['alice'] }).includes('alice'));
    for (const literal of ["'PRIVATE_PASSWORD'", '123456', "'unterminated", "'escaped\\'PRIVATE_PASSWORD'"]) {
        const text = capture({ statement: 'UPDATE users SET password = ' + literal, parameters: ['PRIVATE_PARAMETER'] });
        assert(!text.includes('PRIVATE_PASSWORD')); assert(!text.includes('123456')); assert(!text.includes('PRIVATE_PARAMETER'));
    }
    assert(!capture({ statement: 'SELECT 1 /* PRIVATE_COMMENT */ -- PRIVATE_COMMENT\n# PRIVATE_COMMENT' }).includes('PRIVATE_COMMENT'));
    assert(capture({ statement: 'SELECT /* missing end' }).includes('UNAVAILABLE'));
    assert(capture({ statement: "SELECT 'broken" }).includes('UNAVAILABLE'));
    assert(capture({ statement: "SELECT 'a''b', `id`, \"name\" FROM users" }).includes('FROM users'));
    assert(!capture("UPDATE users SET password = 'PRIVATE_PASSWORD'").includes('PRIVATE_PASSWORD'));
});
test('serialized configuration, environment secrets and credential URLs remain redacted', () => {
    process.env.TEST_API_TOKEN = 'PRIVATE_ENV_SECRET';
    try {
        const value = capture({ data: '{"password":"PRIVATE_JSON"}', url: 'https://user:PRIVATE_URI@example.test/?token=PRIVATE_QUERY', other: 'PRIVATE_ENV_SECRET' });
        for (const text of ['PRIVATE_JSON', 'PRIVATE_URI', 'PRIVATE_QUERY', 'PRIVATE_ENV_SECRET']) assert(!value.includes(text));
    } finally { delete process.env.TEST_API_TOKEN; }
    assert(capture({ bad: '{invalid' }).includes('UNPARSEABLE'));
    assert(capture({ date: new Date(0), invalid: new Date(NaN), regex: /hello/ }).includes('1970'));
    assert(capture({ id: { _bsontype: 'ObjectId', toHexString: () => '0123456789abcdef01234567' } }).includes('0123456789abcdef01234567'));
});
test('bounds depth, arrays, text and cyclic or failing input without exposing original values', () => {
    const cyclic = {}; cyclic.self = cyclic;
    assert(capture(cyclic).includes('CIRCULAR'));
    assert(capture({ huge: 'x'.repeat(20000) }).includes('LIMIT'));
    assert(capture({ list: Array.from({ length: 100 }, (_, i) => i) }).length < 4096);
    let deep = { end: true }; for (let i = 0; i < 12; i++) deep = { next: deep };
    assert(capture(deep).includes('TRUNCATED'));
    assert(capture({ statement: 'x'.repeat(20000) }).includes('LIMIT'));
    assert(capture({ many: Object.fromEntries(Array.from({ length: 64 }, (_, i) => ['field'+i, 'x'.repeat(256)])) }).length <= 4096);
    assert(capture({ missing: undefined }).includes('UNSUPPORTED'));
    assert(capture({ get broken() { throw new Error('PRIVATE'); } }).includes('UNAVAILABLE'));
    assert(!capture({ get broken() { throw new Error('PRIVATE'); } }).includes('PRIVATE'));
});

test('opaque bodies and credential key/value records cannot bypass password redaction', () => {
    for (const value of [{ messages_json: 'my password is PRIVATE_PASSWORD' }, { body: 'PRIVATE_PASSWORD' }, { key: 'auth_token', value: 'PRIVATE_TOKEN' }, { webhook: 'https://example.test/PRIVATE_TOKEN' }]) assert(!capture(value).includes('PRIVATE_'));
    assert(capture({ key: 'order_id', value: 'order-123' }).includes('order-123'));
});
