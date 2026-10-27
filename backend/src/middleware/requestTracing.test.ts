import { expect, test } from '@jest/globals';
import { requestTracing } from './requestTracing';
import type { NextFunction, Request, Response } from 'express';

test.each([
    ['/kubiq-api/api/users/PRIVATE_ID?token=SYNTHETIC_SECRET', '/:userId', '/kubiq-api/api/users/:userId'],
    ['/kubiq-api/api/auth/webauthn/register', '/register', '/kubiq-api/api/auth/webauthn/register'],
    ['/kubiq-api/api/services/PRIVATE_ID', undefined, '/kubiq-api/api/services/*'],
    ['/PRIVATE_ID?token=SYNTHETIC_SECRET', undefined, '/*'],
    ['http://[', undefined, '/*'],
])('normalizes %s without exposing identifiers, queries or mount ambiguity', (originalUrl, path, expected) => {
    let route: (() => string) | undefined;
    let called = false;
    const middleware = requestTracing((_request, _response, action, options) => { route = options.route; return action(); }, '/kubiq-api');
    const request = { originalUrl, route: { path } } as Request;
    middleware(request, {} as Response, (() => { called = true; }) as NextFunction);
    expect(called).toBe(true);
    expect(route?.()).toBe(expected);
});
