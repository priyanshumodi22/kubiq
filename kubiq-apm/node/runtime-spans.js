const { getRuntime } = require('./runtime-state');
const policy = require('./runtime-policy');
function withoutTracing(action) {
    const runtime = getRuntime();
    return runtime ? runtime.api.context.with(runtime.api.ROOT_CONTEXT, action) : action();
}
function traceRequest(request, response, action, options = {}) {
    const runtime = getRuntime();
    if (!runtime || runtime.stopping || policy.excluded(request, runtime.profile)) return withoutTracing(action);
    const { api, tracer, scopeKey } = runtime;
    const parent = api.propagation.extract(api.ROOT_CONTEXT, { traceparent: request.headers?.traceparent });
    const verb = policy.method(request.method);
    const span = tracer.startSpan(verb + ' /*', { kind: api.SpanKind.SERVER, attributes: { 'http.request.method': verb } }, parent);
    const scope = { active: true };
    let ended = false;
    const finish = error => {
        if (ended) return;
        ended = true;
        scope.active = false;
        response.removeListener('finish', onFinish);
        response.removeListener('close', onClose);
        const route = policy.routeName(request, options.route);
        span.updateName(verb + ' ' + route);
        span.setAttribute('http.route', route);
        span.setAttribute('http.response.status_code', response.statusCode);
        if (error || response.statusCode >= 500) span.setStatus({ code: api.SpanStatusCode.ERROR });
        if (error) span.setAttribute('error.type', policy.errorType(error));
        span.end();
    };
    const onFinish = () => finish();
    const onClose = () => finish(response.writableFinished ? undefined : { name: 'AbortError' });
    response.once('finish', onFinish);
    response.once('close', onClose);
    const context = api.trace.setSpan(parent, span).setValue(scopeKey, scope);
    try {
        const result = api.context.with(context, action);
        if (result && typeof result.then === 'function') return result.then(value => value, error => { finish(error); throw error; });
        return result;
    }
    catch (error) { finish(error); throw error; }
}
function traceDependency(name, action, values = {}) {
    const runtime = getRuntime();
    const scope = runtime?.api.context.active().getValue(runtime.scopeKey);
    if (!runtime || runtime.stopping || !scope?.active) return action();
    const { api, tracer } = runtime;
    const safeName = /^[a-zA-Z][a-zA-Z0-9_. -]{0,79}$/.test(name) ? name : 'dependency';
    const span = tracer.startSpan(safeName, { kind: api.SpanKind.CLIENT, attributes: policy.attributes(values) });
    const fail = error => {
        span.setStatus({ code: api.SpanStatusCode.ERROR });
        span.setAttribute('error.type', policy.errorType(error));
        span.end();
        throw error;
    };
    return api.context.with(api.trace.setSpan(api.context.active(), span), () => {
        try {
            const result = action();
            if (result && typeof result.then === 'function') return result.then(value => { span.end(); return value; }, fail);
            span.end();
            return result;
        } catch (error) { return fail(error); }
    });
}
function beginDependency(name, values = {}) {
    const runtime = getRuntime();
    const scope = runtime?.api.context.active().getValue(runtime.scopeKey);
    if (!runtime || runtime.stopping || !scope?.active) return null;
    const { api, tracer } = runtime;
    const span = tracer.startSpan(/^[a-zA-Z][a-zA-Z0-9_. -]{0,79}$/.test(name) ? name : 'database.call', { kind: api.SpanKind.CLIENT, attributes: policy.attributes(values) });
    let ended = false;
    return {
        setAttributes(attributes) { if (!ended) span.setAttributes(policy.attributes(attributes)); },
        end(error) {
            if (ended) return;
            ended = true;
            if (error) { span.setStatus({ code: api.SpanStatusCode.ERROR }); span.setAttribute('error.type', policy.errorType(error)); }
            span.end();
        },
    };
}
module.exports = { traceRequest, traceDependency, beginDependency, withoutTracing };
