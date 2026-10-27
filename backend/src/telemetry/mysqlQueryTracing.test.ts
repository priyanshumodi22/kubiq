import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { instrumentMysqlRepository } from './mysqlQueryTracing';
import * as tracing from './databaseSpan';
jest.mock('./databaseSpan', () => ({ beginDatabaseSpan: jest.fn(), databaseDetailsEnabled: jest.fn(), queryDetails: jest.fn() }));
const attributes = jest.fn();
const end = jest.fn();
const metadata = () => ({ 'db.system': 'mysql', 'db.namespace': 'kubiq', 'server.port': 3306 });
beforeEach(() => {
    jest.mocked(tracing.databaseDetailsEnabled).mockReturnValue(true);
    jest.mocked(tracing.beginDatabaseSpan).mockReturnValue({ setAttributes: attributes, end });
    jest.mocked(tracing.queryDetails).mockReturnValue('REDACTED_QUERY');
});
afterEach(() => { jest.clearAllMocks(); });
test('query/execute preserve private state, arguments and results while reporting timing context and counts', async () => {
    class Pool {
        #value = 2;
        async query(sql: string, values: unknown[]) { expect(sql).toBe('SELECT * FROM users WHERE username = ?'); expect(values).toEqual(['alice']); return [[{ id: this.#value }], []]; }
        async execute() { return [{ affectedRows: 0 }, []]; }
    }
    const original = new Pool(), repository = instrumentMysqlRepository({ pool: original }, metadata);
    expect(await repository.pool.query('SELECT * FROM users WHERE username = ?', ['alice'])).toEqual([[{ id: 2 }], []]);
    expect(repository.pool.query).toBe(repository.pool.query);
    expect(attributes).toHaveBeenCalledWith({ 'db.response.returned_rows': 1 });
    expect(tracing.queryDetails).toHaveBeenCalledWith({ statement: 'SELECT * FROM users WHERE username = ?', parameters: ['alice'] });
    await repository.pool.execute();
    expect(attributes).toHaveBeenCalledWith({ 'db.response.affected_rows': 0 });
    expect(tracing.beginDatabaseSpan).toHaveBeenCalledWith('mysql.SELECT', expect.objectContaining({ 'db.operation.name': 'SELECT', 'code.namespace': 'mysql2.driver' }));
});
test('pooled connections, transactions and replacement pools retain binding and original errors', async () => {
    const error = Object.assign(new Error('PRIVATE_PASSWORD'), { code: 'ER_ACCESS_DENIED_ERROR' });
    const release = jest.fn();
    const connection = { async execute() { throw error; }, release, async beginTransaction() { return undefined; }, async commit() {}, async rollback() {} };
    const pool = { async getConnection() { return connection; }, label: 'pool' };
    const repository = instrumentMysqlRepository({ pool }, metadata);
    const obtained = await repository.pool.getConnection();
    await expect(obtained.execute()).rejects.toBe(error);
    expect(attributes).toHaveBeenCalledWith({ 'db.response.status_code': 'ER_ACCESS_DENIED_ERROR' });
    expect(end).toHaveBeenCalledWith(error);
    await obtained.beginTransaction(); await obtained.commit(); await obtained.rollback(); obtained.release();
    expect(release).toHaveBeenCalledTimes(1);
    expect(repository.pool.label).toBe('pool');
    repository.pool = { ...pool };
    expect((await repository.pool.getConnection())).not.toBe(connection);
});
test('background work and disabled capture do not serialize statements; instrumentation failures fail open', async () => {
    const query = jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue([[], []]);
    const repository = instrumentMysqlRepository({ pool: { query } }, metadata);
    jest.mocked(tracing.databaseDetailsEnabled).mockReturnValue(false);
    await repository.pool.query('SELECT 1');
    expect(tracing.beginDatabaseSpan).not.toHaveBeenCalled();
    expect(tracing.queryDetails).not.toHaveBeenCalled();
    jest.mocked(tracing.databaseDetailsEnabled).mockReturnValue(true);
    jest.mocked(tracing.beginDatabaseSpan).mockReturnValueOnce(null);
    await repository.pool.query('SELECT 2');
    expect(tracing.queryDetails).not.toHaveBeenCalled();
    jest.mocked(tracing.queryDetails).mockImplementationOnce(() => { throw new Error('unavailable'); });
    await expect(repository.pool.query('SELECT 3')).resolves.toEqual([[], []]);
    attributes.mockImplementationOnce(() => { throw new Error('unavailable'); });
    await expect(repository.pool.query({ sql: 'SELECT ?', values: [1] })).resolves.toEqual([[], []]);
});
test('synchronous errors and non-promise results are not changed by the wrapper', () => {
    const error = new Error('PRIVATE');
    const pool = { query() { throw error; }, execute() { return [[1], []]; } };
    const repository = instrumentMysqlRepository({ pool }, metadata);
    expect(() => repository.pool.query()).toThrow(error);
    expect(repository.pool.execute()).toEqual([[1], []]);
});
