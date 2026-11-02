import { describe, expect, it } from '@jest/globals';
import { redactEndpointPassword, resolveEndpointUpdate } from './sensitiveData';

describe('connection password visibility and safe editing', () => {
  it.each([
    ['mongodb+srv://user:p%40ss@cluster/db?retryWrites=true', 'mongodb+srv://user:*****@cluster/db?retryWrites=true'],
    ['mongodb://user:p@ss@db1:27017,db2:27017/db', 'mongodb://user:*****@db1:27017,db2:27017/db'],
    ['mysql://user:secret@[::1]:3306/db', 'mysql://user:*****@[::1]:3306/db'],
    ['https://user:secret@example.test/health', 'https://user:*****@example.test/health'],
    ['mysql://host/db?password=secret&x=1', 'mysql://host/db?password=*****&x=1'],
    ['https://example.test/health', 'https://example.test/health'],
    ['mongodb://user@host/db', 'mongodb://user@host/db'],
  ])('redacts %s without changing connection identity', (input, expected) => {
    expect(redactEndpointPassword(input)).toBe(expected);
  });

  it('preserves the stored password when other service settings are edited', () => {
    const stored = 'mongodb://user:secret@db/internal';
    expect(resolveEndpointUpdate(redactEndpointPassword(stored), stored)).toBe(stored);
    expect(stored).toContain('secret');
  });

  it('rejects changed masked endpoints and accepts explicit replacements', () => {
    expect(() => resolveEndpointUpdate('mongodb://user:*****@new-host/db', 'mongodb://user:secret@db/internal')).toThrow('complete connection endpoint');
    expect(resolveEndpointUpdate('mongodb://user:new-password@new-host/db', 'mongodb://user:secret@db/internal')).toBe('mongodb://user:new-password@new-host/db');
  });
});
