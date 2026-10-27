function redactString(value, seen, depth) {
    if (value.length > 16384) return '[VALUE EXCEEDS CAPTURE LIMIT]';
    if (/^\s*[{[]/.test(value)) {
        try { return redact(JSON.parse(value), '', seen, depth + 1); }
        catch { return '[UNPARSEABLE STRUCTURED VALUE]'; }
    }
    return cleanString(value);
}
const sensitiveKey = /password|passwd|pwd|secret|token|credential|authorization|cookie|api[_-]?key|private[_-]?key|signing[_-]?key|encryption[_-]?key|config/i;
function cleanString(value) {
    let text = value;
    for (const [key, secret] of Object.entries(process.env)) {
        if (sensitiveKey.test(key) && secret && secret.length >= 6) text = text.split(secret).join('[REDACTED]');
    }
    return redactUriCredentials(text.slice(0, 8192)).replace(/((?:password|passwd|pwd|passphrase|token|secret|api[_-]?key|signature|code)=)[^&\s]+/gi, '$1[REDACTED]');
}
const { sqlStatement } = require('./runtime-query-sql');
function redact(value, key, seen, depth) {
    if (sensitiveKey.test(key)) return '[REDACTED]';
    if (depth > 8) return '[TRUNCATED]';
    if (typeof value === 'string') return redactString(value, seen, depth);
    if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value !== 'object') return '[UNSUPPORTED VALUE]';
    if (seen.has(value)) return '[CIRCULAR]';
    seen.add(value);
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : '[INVALID DATE]';
    if (ArrayBuffer.isView(value) || value._bsontype === 'Binary') return '[BINARY OMITTED]';
    if (value instanceof RegExp) return cleanString(String(value));
    if (value._bsontype === 'ObjectId' && typeof value.toHexString === 'function') return value.toHexString();
    if (Array.isArray(value)) return value.slice(0, 20).map(item => redact(item, key, seen, depth + 1));
    return redactEntries(value, seen, depth);
}
function redactEntries(value, seen, depth) {
    const result = Object.create(null);
    const sql = typeof value.statement === 'string' ? value.statement : null;
    const mask = sql && (sensitiveKey.test(sql) || sql.length > 16384 || /^\s*CALL\b/i.test(sql) || (/^\s*(?:INSERT|REPLACE|UPDATE)/i.test(sql) && /\busers\b/i.test(sql)));
    const configurationWrite = ['systempreferences', 'systemconfigs', 'notifications'].includes(value.update || value.insert || value.findAndModify);
    for (const [name, item] of Object.entries(value).slice(0, 64)) {
        if (['lsid', '$clusterTime', 'txnNumber'].includes(name)) continue;
        if (configurationWrite && (['updates', 'documents'].includes(name) || (name === 'update' && value.findAndModify))) { result[name] = '[REDACTED: CONFIGURATION WRITE]'; continue; }
        if (name === 'statement' && sql !== null) result[name] = cleanString(sqlStatement(sql, mask));
        else if (name === 'parameters' && mask) result[name] = '[REDACTED: CREDENTIAL-RELATED STATEMENT]';
        else result[cleanString(name)] = redact(item, name, seen, depth + 1);
    }
    return result;
}
function databaseQueryDetails(value) {
    try {
        if (typeof value === 'string') {
            try { const parsed = JSON.parse(value); value = parsed && typeof parsed === 'object' ? parsed : { statement: value }; }
            catch { value = { statement: value }; }
        }
        const text = JSON.stringify(redact(value, '', new WeakSet(), 0));
        return text.length > 4096 ? JSON.stringify({ truncated: true, preview: 'Preview: ' + text.slice(0, 1800) }) : text;
    } catch { return '[QUERY DETAILS UNAVAILABLE]'; }
}
module.exports = { databaseQueryDetails };

function redactUriCredentials(text) {
    let cursor = 0;
    while (cursor < text.length) {
        const separator = text.indexOf('://', cursor);
        if (separator < 0) break;
        const start = separator + 3;
        let end = start;
        while (end < text.length && !['/', '?', '#', ' ', "'", '"', '\n'].includes(text[end])) end++;
        const at = text.indexOf('@', start);
        if (at > start && at < end) text = text.slice(0, start) + '[REDACTED]' + text.slice(at);
        cursor = start;
    }
    return text;
}
