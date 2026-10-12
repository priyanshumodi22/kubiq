import { describe, expect, it } from '@jest/globals';
import { isLastActiveAdmin } from './users';

describe('last-active-admin protection', () => {
  const onlyAdmin = [{ id: 'admin-1', role: 'kubiq-admin', roles: ['kubiq-admin'], enabled: true }];

  it('blocks disabling, deleting, or removing the only active kubiq-admin', () => {
    expect(isLastActiveAdmin(onlyAdmin, 'admin-1', undefined, false)).toBe(true);
    expect(isLastActiveAdmin(onlyAdmin, 'admin-1', [], false)).toBe(true);
    expect(isLastActiveAdmin(onlyAdmin, 'admin-1', ['kubiq-user'])).toBe(true);
  });

  it('allows a change once a second active kubiq-admin exists', () => {
    const users = [...onlyAdmin, { id: 'admin-2', role: 'kubiq-admin', roles: ['kubiq-admin'], enabled: true }];
    expect(isLastActiveAdmin(users, 'admin-1', ['kubiq-user'])).toBe(false);
    expect(isLastActiveAdmin(users, 'admin-1', undefined, false)).toBe(false);
  });
});
