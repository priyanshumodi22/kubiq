import { describe, expect, it } from 'vitest';
import { requestErrorMessage, requestErrorStatus, requestServerErrorMessage } from './requestError';

describe('request failure boundaries', () => {
  it('keeps server-only forms from exposing transport or malformed payload text', () => {
    expect(requestServerErrorMessage({ message: 'Transport', response: { data: { message: 'Server' } } }, 'Fallback')).toBe('Server');
    for (const failure of [null, new Error('Transport'), { response: { data: { message: [] } } }, { response: { data: { message: '' } } }]) expect(requestServerErrorMessage(failure, 'Fallback')).toBe('Fallback');
  });

  it('preserves explicit server text before the transport message', () => {
    const failure = { message: 'Network fixture', response: { status: 403, data: { message: 'Denied fixture', error: 'APM fixture' } } };
    expect(requestErrorMessage(failure, 'Fallback')).toBe('Denied fixture');
    expect(requestErrorMessage(failure, 'Fallback', 'error')).toBe('APM fixture');
    expect(requestErrorStatus(failure)).toBe(403);
  });

  it('preserves Error messages when no explicit server text exists', () => {
    expect(requestErrorMessage(new Error('Offline fixture'), 'Fallback')).toBe('Offline fixture');
    expect(requestErrorMessage({ response: { data: { message: '' } }, message: 'Transport fixture' }, 'Fallback')).toBe('Transport fixture');
  });

  it('uses a readable fallback for malformed or non-text errors', () => {
    for (const failure of [null, undefined, 42, 'rejected fixture', { message: {} }, { response: { status: '404', data: { message: [] } } }]) {
      expect(requestErrorMessage(failure, 'Fallback')).toBe('Fallback');
      expect(requestErrorStatus(failure)).toBeUndefined();
    }
  });
});
