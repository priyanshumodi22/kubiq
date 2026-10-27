import { expect, jest, test } from '@jest/globals';
import { DependencyTracer, traceRepository } from './traceRepository';

test('repository operations retain private state, return values, arguments and stable method identity', async () => {
    class Repository {
        #value = 4;
        label = 'users';
        getValue(add: number) { return this.#value + add; }
        async read() { return this.#value; }
        initialize() { return this.#value; }
        insertSpans() { return this.#value; }
    }
    const trace: DependencyTracer = jest.fn<DependencyTracer>().mockImplementation((_, action) => action()) as DependencyTracer;
    const repository = traceRepository(new Repository(), 'users', trace);
    expect(repository.getValue(3)).toBe(7);
    expect(await repository.read()).toBe(4);
    expect(repository.getValue).toBe(repository.getValue);
    expect(repository.label).toBe('users');
    expect(repository.initialize()).toBe(4);
    expect(repository.insertSpans()).toBe(4);
    expect(trace).toHaveBeenCalledTimes(2);
    expect(trace).toHaveBeenCalledWith('mongodb.users.getValue', expect.any(Function), { 'db.system': 'mongodb', 'db.operation.name': 'getValue' });
});
test('repository errors and rejected promises preserve their original identity and reveal no arguments', async () => {
    const error = new Error('SYNTHETIC_SECRET');
    const trace: DependencyTracer = jest.fn<DependencyTracer>().mockImplementation((_, action) => action()) as DependencyTracer;
    const repository = traceRepository({ fail(query: string) { expect(query).toBe('SYNTHETIC_SECRET'); throw error; }, async reject() { throw error; }, ['private-operation']() { return 2; } }, 'users', trace);
    expect(() => repository.fail('SYNTHETIC_SECRET')).toThrow(error);
    await expect(repository.reject()).rejects.toBe(error);
    expect(repository['private-operation']()).toBe(2);
    expect(JSON.stringify(jest.mocked(trace).mock.calls.map(call => [call[0], call[2]]))).not.toContain('SYNTHETIC_SECRET');
});

test('adds operation metadata lazily without forwarding query arguments to its context provider', () => {
    const context = jest.fn<(operation: string) => Record<string, string | number>>().mockReturnValue({ 'db.collection.name': 'users', 'server.port': 27017 });
    const trace = jest.fn<DependencyTracer>().mockImplementation((_, action) => action());
    const repository = traceRepository({ read(value: string) { return value; } }, 'users', trace, context);
    expect(repository.read('SYNTHETIC_SECRET')).toBe('SYNTHETIC_SECRET');
    expect(context).toHaveBeenCalledWith('read');
    expect(trace).toHaveBeenCalledWith('mongodb.users.read', expect.any(Function), { 'db.system': 'mongodb', 'db.operation.name': 'read', 'db.collection.name': 'users', 'server.port': 27017 });
});
