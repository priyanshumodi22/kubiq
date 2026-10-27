import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { JsonUserRepository } from './JsonUserRepository';

describe('JsonUserRepository RBAC migration', () => {
  const originalDataDir = process.env.DATA_DIR;
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kubiq-users-'));
    process.env.DATA_DIR = dataDir;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('keeps users created at the same clock tick distinct and preserves older IDs', async () => {
    fs.writeFileSync(path.join(dataDir, 'users.json'), JSON.stringify([{ id: '1700000000000', username: 'older', role: 'kubiq-viewer', enabled: true }]));
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const repository = new JsonUserRepository(); await repository.initialize();
    const first = await repository.createUser({ username: 'first', role: 'kubiq-admin' });
    const second = await repository.createUser({ username: 'second', role: 'kubiq-viewer' });
    expect(first.id).not.toBe(second.id);
    expect((await repository.findById(first.id))?.username).toBe('first');
    expect((await repository.findById(second.id))?.username).toBe('second');
    expect((await repository.findById('1700000000000'))?.username).toBe('older');
  });

  it('backfills legacy single-role users and preserves existing multi-role assignments', async () => {
    fs.writeFileSync(path.join(dataDir, 'users.json'), JSON.stringify([
      { id: 'legacy', username: 'legacy', role: 'kubiq-admin', enabled: true },
      { id: 'multi', username: 'multi', role: 'kubiq-user', roles: ['kubiq-user', 'kubiq-viewer'], enabled: true },
    ]));

    const repository = new JsonUserRepository();
    await repository.initialize();

    await expect(repository.findById('legacy')).resolves.toMatchObject({ role: 'kubiq-admin', roles: ['kubiq-admin'] });
    await expect(repository.findById('multi')).resolves.toMatchObject({ role: 'kubiq-user', roles: ['kubiq-user', 'kubiq-viewer'] });
    expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'users.json'), 'utf8'))).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'legacy', roles: ['kubiq-admin'] }),
    ]));
  });
});
