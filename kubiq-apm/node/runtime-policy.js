const methods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const safeAttributes = new Set(['db.system', 'db.operation.name', 'server.address', 'http.request.method', 'http.response.status_code', 'http.route', 'error.type']);
function method(value) { return methods.has(value) ? value : 'OTHER'; }
function pathOf(request) {
    try { return new URL(request.url || '/', 'https://local').pathname; }
    catch { return '/'; }
}
function excluded(request, profile) {
    const path = pathOf(request);
    if (/(?:^|\/)(?:healthz?|readyz?|readiness)(?:\/|$)/.test(path) || /\.(?:css|js|map|json|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|txt|xml|webmanifest|avif|wasm|mp4|pdf)$/i.test(path)) return true;
    if (/(?:^|\/)(?:assets|static|socket\.io)(?:\/|$)/.test(path) || /(?:^|\/)(?:stream|live|events-stream)(?:\/|$)/.test(path)) return true;
    if (profile === 'kubiq' && /\/api\/(?:apm|telemetry)(?:\/|$)/.test(path)) return true;
    if (profile === 'kubiq' && request.method === 'POST' && /\/api\/kubi\/conversations\/[^/]+\/messages$/.test(path)) return true;
    return profile === 'portfolio' && request.method === 'POST' && path === '/api/codex-activity';
}
function attributes(values = {}) {
    return Object.fromEntries(Object.entries(values).filter(([key, value]) => safeAttributes.has(key) && (typeof value === 'string' || typeof value === 'number')).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 256) : value]));
}
function routeName(request, resolver) {
    const route = resolver ? resolver() : request.route?.path;
    if (typeof route !== 'string' || !route.startsWith('/') || route.includes('?') || route.length > 200) return '/*';
    return route;
}
function errorType(error) {
    return ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'AbortError', 'TimeoutError', 'MongoServerError', 'AxiosError'].includes(error?.name) ? error.name : 'Error';
}
function safeSpan(span) {
    const values = { ...span.attributes };
    values['http.request.method'] ??= values['http.method'];
    values['http.response.status_code'] ??= values['http.status_code'];
    if (values['http.url']) {
        try { values['server.address'] = new URL(values['http.url']).hostname; } catch { /* Invalid URLs are discarded. */ }
    }
    const clean = Object.create(span);
    clean.attributes = attributes(values);
    clean.events = [];
    clean.links = [];
    clean.status = { code: span.status.code };
    return clean;
}
module.exports = { method, pathOf, excluded, attributes, routeName, errorType, safeSpan };
