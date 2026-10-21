import { expect, test } from '@jest/globals';
import { newAuditId } from './auditId';

test('new audit IDs preserve the prefix, fit every adapter, and remain unique', () => {
  const ids = Array.from({ length: 1000 }, newAuditId);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) {
    expect(id).toMatch(/^audit-\d+-[0-9a-f-]{36}$/);
    expect(id.length).toBeLessThanOrEqual(255);
  }
});
