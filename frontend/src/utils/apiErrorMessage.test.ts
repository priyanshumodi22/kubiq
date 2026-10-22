import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './apiErrorMessage';

describe('server error message boundary', () => {
  it('preserves explicit backend text messages', () => {
    expect(apiErrorMessage({ isAxiosError: true, response: { data: { message: 'Permission required' } } }, 'Failed')).toBe('Permission required');
  });
  it.each([null, 'secret', new Error('internal'), { isAxiosError: true }, { isAxiosError: true, response: { data: null } }, { isAxiosError: true, response: { data: { message: { token: 'secret' } } } }])('uses a safe fallback for malformed errors', error => {
    expect(apiErrorMessage(error, 'Failed')).toBe('Failed');
  });
});
