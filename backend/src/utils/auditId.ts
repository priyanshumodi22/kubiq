import { randomUUID } from 'node:crypto';

/** New records only. Existing audit IDs are never rewritten. */
export function newAuditId(): string {
  return `audit-${Date.now()}-${randomUUID()}`;
}
