import type { NextFunction, Request, Response } from 'express';

type RequestTracer = <T>(request: Request, response: Response, action: () => T, options: { route: () => string }) => T;
const groups = ['auth/webauthn', 'auth', 'public', 'services', 'notifications', 'users', 'system', 'rbac', 'logs', 'kubernetes', 'audit-logs', 'kubi'];

export function requestTracing(trace: RequestTracer, contextPath: string) {
    return (request: Request, response: Response, next: NextFunction): void => {
        // Resolve only a fixed API mount name; never turn a URL or identifier into an attribute.
        let pathname = '/';
        try { pathname = new URL(request.originalUrl, 'https://local').pathname; }
        catch { /* Invalid URLs must not change business request handling. */ }
        const prefix = groups.map(group => contextPath + '/api/' + group).find(group => pathname === group || pathname.startsWith(group + '/'));
        trace(request, response, next, { route: () => {
            const route: unknown = request.route?.path;
            if (!prefix) return '/*';
            return prefix + (typeof route === 'string' ? route : '/*');
        } });
    };
}
