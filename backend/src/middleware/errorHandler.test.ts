import { describe, expect, test, jest, afterEach } from '@jest/globals';
import type { Request, Response } from 'express';
import { errorHandler } from './errorHandler';

afterEach(() => { jest.restoreAllMocks(); });
describe('error response lifecycle', () => {
  test('delegates after headers are sent instead of writing a second response', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const status = jest.fn();
    const response = { headersSent: true, status } as unknown as Response;
    const next = jest.fn();
    const error = new Error('stream disconnected');
    // Use the same error object when delegating to Express's final handler.
    errorHandler(error, {} as Request, response, next);
    expect(next).toHaveBeenLastCalledWith(error);
    expect(status).not.toHaveBeenCalled();
  });
  test('preserves explicit error status and safe production payload', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const json = jest.fn();
    const status = jest.fn<(code: number) => { json: typeof json }>(() => ({ json }));
    const response = { headersSent: false, statusCode: 403, status } as unknown as Response;
    errorHandler(new Error('Forbidden'), {} as Request, response, jest.fn());
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'Error', message: 'Forbidden' });
  });
});
