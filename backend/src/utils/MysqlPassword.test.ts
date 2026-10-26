import { describe, expect, test } from '@jest/globals';
import { mysqlPassword } from './MysqlPassword';
describe('shared SQL password policy', () => {
 test.each([ [{}, ''], [{ DB_PASSWORD: 'canonical' }, 'canonical'], [{ DB_PASS: 'legacy' }, 'legacy'], [{ DB_PASSWORD: 'same', DB_PASS: 'same' }, 'same'], [{ DB_PASSWORD: '' }, ''], [{ DB_PASS: '' }, ''], [{ DB_PASSWORD: '', DB_PASS: '' }, ''], [{ DB_PASSWORD: ' spaced ' }, ' spaced '] ] as const)('resolves a supported configuration', (env, expected) => expect(mysqlPassword(env)).toBe(expected));
 test.each([{DB_PASSWORD:'private-canonical-value',DB_PASS:'private-legacy-value'},{DB_PASSWORD:'',DB_PASS:'private-legacy-value'},{DB_PASSWORD:'private-canonical-value',DB_PASS:''}])('rejects conflicting aliases without exposing credentials', env => {
  expect(() => mysqlPassword(env)).toThrow('DB_PASSWORD and DB_PASS must match');
  try { mysqlPassword(env); } catch (error) { expect((error as Error).message).not.toContain('private-canonical-value'); expect((error as Error).message).not.toContain('private-legacy-value'); }
 });
});
