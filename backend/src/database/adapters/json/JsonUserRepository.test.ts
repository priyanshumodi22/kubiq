import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { JsonUserRepository } from './JsonUserRepository';

describe('JsonUserRepository RBAC migration', () => {
  const originalDataDir = process.env.DATA_DIR;
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kubiq-users-'));
    process.env.DATA_DIR = dataDir;
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    fs.rmSync(dataDir, { recursive: true, force: true });
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
