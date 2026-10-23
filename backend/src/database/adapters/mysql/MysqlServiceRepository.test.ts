import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import mysql from 'mysql2/promise';
import { MysqlServiceRepository } from './MysqlServiceRepository';

jest.mock('mysql2/promise', () => ({ __esModule: true, default: { createPool: jest.fn() } }));

const migrationColumns = ['ignore_ssl', 'ssl_expiry', 'log_sources', 'uptime', 'average_response_time', 'interval', 'retries'];
const query = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const execute = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();
const release = jest.fn();
const connection = { query, release };

beforeEach(() => {
    jest.clearAllMocks();
    query.mockImplementation(async (sql) => {
        if (sql === 'SHOW COLUMNS FROM services') return [migrationColumns.map(Field => ({ Field }))];
        if (sql === 'SELECT * FROM services') return [[{ id: 7, name: 'api', endpoint: 'https://example.test', log_sources: null }]];
        return [[]];
    });
    execute.mockImplementation(async (sql) => sql === 'SELECT id FROM services WHERE name = ?' ? [[{ id: 7 }]] : [{ affectedRows: 1 }]);
    jest.mocked(mysql.createPool).mockReturnValue({ getConnection: async () => connection, query, execute } as unknown as ReturnType<typeof mysql.createPool>);
});

describe('MySQL service repository compatibility', () => {
    it('does not migrate existing columns and releases initialization connections', async () => {
        const repository = new MysqlServiceRepository();
        await repository.initialize();
        expect(query.mock.calls.some(([sql]) => String(sql).startsWith('ALTER TABLE'))).toBe(false);
        expect(release).toHaveBeenCalledTimes(2);
        expect((await repository.getServiceByName('api'))?.id).toBe('7');
    });

    it('adds missing columns without changing their defaults', async () => {
        query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
        const repository = new MysqlServiceRepository();
        await repository.initialize();
        expect(query.mock.calls.filter(([sql]) => String(sql).startsWith('ALTER TABLE'))).toHaveLength(7);
        expect(query).toHaveBeenCalledWith('ALTER TABLE services ADD COLUMN `interval` INT DEFAULT 30000');
        expect(query).toHaveBeenCalledWith('ALTER TABLE services ADD COLUMN retries INT DEFAULT 3');
    });

    it.each([undefined, null, new Date('2027-01-01T00:00:00Z')])('preserves optional SSL update semantics for %s', async (sslExpiry) => {
        const repository = new MysqlServiceRepository();
        await repository.initialize();
        await repository.saveCheckResult('api', { timestamp: 1000, responseTime: 25, status: 200, success: true }, { sslExpiry });
        const updates = execute.mock.calls.filter(([sql]) => String(sql).startsWith('UPDATE services'));
        expect(updates).toHaveLength(1);
        if (sslExpiry === undefined) {
            expect(updates[0]).toEqual(['UPDATE services SET current_status = ?, updated_at = NOW() WHERE id = ?', ['healthy', 7]]);
        } else {
            expect(updates[0]).toEqual(['UPDATE services SET current_status = ?, updated_at = NOW(), ssl_expiry = ? WHERE id = ?', ['healthy', sslExpiry, 7]]);
        }
    });
});
