import { jest, expect, it, afterEach } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonSystemRepository } from './adapters/json/JsonSystemRepository';
import { MysqlSystemRepository } from './adapters/mysql/MysqlSystemRepository';
import { MongoSystemRepository } from './adapters/mongo/MongoSystemRepository';
import { SystemPreferencesModel } from './schemas/SystemPreferencesSchema';
import type { KubernetesLogConfig } from './interfaces/ISystemRepository';
const config: KubernetesLogConfig = { version: 1, sources: [{ id: 'fixture', name: 'Web', namespace: 'apps', kind: 'service', resource: 'web', updatedAt: 1 }], updatedAt: 1 };
afterEach(() => { jest.restoreAllMocks(); });
it('persists JSON source configuration across repository instances', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kubiq-log-config-'));
    const previous = process.env.DATA_DIR; process.env.DATA_DIR = dir;
    try {
        const repo = new JsonSystemRepository(); expect(await repo.getKubernetesLogConfig()).toBeNull();
        await repo.saveKubernetesLogConfig(config);
        expect(await new JsonSystemRepository().getKubernetesLogConfig()).toEqual(config);
    } finally { if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous; fs.rmSync(dir, { recursive: true, force: true }); }
});
it('uses a dedicated key in MongoDB system preferences without changing other configuration', async () => {
    const repo = new MongoSystemRepository(); jest.spyOn(repo, 'initialize').mockResolvedValue(undefined);
    jest.spyOn(SystemPreferencesModel, 'findOneAndUpdate').mockResolvedValue(null);
    jest.spyOn(SystemPreferencesModel, 'findOne').mockReturnValue({ lean: async () => ({ value: config }) } as unknown as ReturnType<typeof SystemPreferencesModel.findOne>);
    await repo.saveKubernetesLogConfig(config); expect(await repo.getKubernetesLogConfig()).toEqual(config);
    expect(SystemPreferencesModel.findOneAndUpdate).toHaveBeenCalledWith({ key: 'kubernetes-log-sources' }, { key: 'kubernetes-log-sources', value: config }, { upsert: true, new: true });
});
it('round-trips string and native JSON values for MySQL and MariaDB', async () => {
    const repo = new MysqlSystemRepository();
    const query = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue([[{ value: JSON.stringify(config) }]]);
    const execute = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue([]);
    Reflect.set(repo, 'pool', { query, execute });
    await repo.saveKubernetesLogConfig(config); expect(await repo.getKubernetesLogConfig()).toEqual(config);
    query.mockResolvedValueOnce([[{ value: config }]]); expect(await repo.getKubernetesLogConfig()).toEqual(config);
    query.mockResolvedValueOnce([[]]); expect(await repo.getKubernetesLogConfig()).toBeNull();
    expect(execute).toHaveBeenCalledWith(expect.stringContaining('INSERT'), ['kubernetes-log-sources', JSON.stringify(config), JSON.stringify(config)]);
});
