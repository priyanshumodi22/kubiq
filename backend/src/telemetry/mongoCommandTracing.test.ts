import { EventEmitter } from 'node:events';
import mongoose from 'mongoose';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { installMongoCommandTracing, observeMongoCommands } from './mongoCommandTracing';
import * as tracing from './databaseSpan';
jest.mock('./databaseSpan', () => ({ beginDatabaseSpan: jest.fn(), databaseDetailsEnabled: jest.fn(), queryDetails: jest.fn() }));
jest.mock('mongoose', () => ({ __esModule: true, default: { connection: { host: 'mongo.internal', port: 27017, readyState: 0, on: jest.fn(), getClient: jest.fn() } } }));
const attributes = jest.fn(), end = jest.fn();
beforeEach(() => {
    jest.mocked(tracing.databaseDetailsEnabled).mockReturnValue(true);
    jest.mocked(tracing.beginDatabaseSpan).mockReturnValue({ setAttributes: attributes, end });
    jest.mocked(tracing.queryDetails).mockReturnValue('REDACTED_QUERY');
});
afterEach(() => { jest.clearAllMocks(); jest.restoreAllMocks(); });
const started = { requestId: 1, commandName: 'find', databaseName: 'kubiq', command: { find: 'users', filter: { username: 'alice', password: 'PRIVATE' } } };
test('observes actual commands once, correlates completion, and stores counts rather than reply documents', () => {
    const client = new EventEmitter(); observeMongoCommands(client); observeMongoCommands(client);
    expect(client.listenerCount('commandStarted')).toBe(1);
    client.emit('commandStarted', started);
    expect(tracing.beginDatabaseSpan).toHaveBeenCalledWith('mongodb.find', expect.objectContaining({ 'db.namespace': 'kubiq', 'db.collection.name': 'users', 'server.port': 27017, 'code.namespace': 'mongodb.command' }));
    client.emit('commandSucceeded', { requestId: 1, reply: { cursor: { firstBatch: [{ password: 'PRIVATE_RESPONSE' }] } } });
    expect(attributes).toHaveBeenCalledWith({ 'db.response.returned_rows': 1 });
    expect(JSON.stringify(attributes.mock.calls)).not.toContain('PRIVATE_RESPONSE');
    expect(end).toHaveBeenCalledWith(undefined);
    client.emit('commandSucceeded', { requestId: 999 });
    expect(end).toHaveBeenCalledTimes(1);
});
test('write counts, cursor batches and real error codes stay attached to the matching call', () => {
    const client = new EventEmitter(); observeMongoCommands(client);
    for (const reply of [{ nModified: 0 }, { n: 2 }, { cursor: { nextBatch: [] } }]) {
        client.emit('commandStarted', { ...started, commandName: 'update', command: { update: 'users' } });
        client.emit('commandSucceeded', { requestId: 1, reply });
    }
    expect(attributes).toHaveBeenCalledWith({ 'db.response.affected_rows': 0 });
    expect(attributes).toHaveBeenCalledWith({ 'db.response.affected_rows': 2 });
    expect(attributes).toHaveBeenCalledWith({ 'db.response.returned_rows': 0 });
    client.emit('commandStarted', started);
    const failure = { name: 'MongoServerError', code: 11000 };
    client.emit('commandFailed', { requestId: 1, failure });
    expect(attributes).toHaveBeenCalledWith({ 'db.response.status_code': 11000 });
    expect(end).toHaveBeenCalledWith(failure);
});
test('monitoring/auth commands and work without an eligible scope create no query payloads', () => {
    const client = new EventEmitter(); observeMongoCommands(client);
    client.emit('commandStarted', { ...started, commandName: 'hello' });
    jest.mocked(tracing.databaseDetailsEnabled).mockReturnValueOnce(false);
    client.emit('commandStarted', started);
    expect(tracing.beginDatabaseSpan).not.toHaveBeenCalled();
    jest.mocked(tracing.beginDatabaseSpan).mockReturnValueOnce(null);
    client.emit('commandStarted', started);
    expect(tracing.queryDetails).not.toHaveBeenCalled();
    jest.mocked(tracing.beginDatabaseSpan).mockImplementationOnce(() => { throw new Error('unavailable'); });
    expect(() => client.emit('commandStarted', started)).not.toThrow();
});
test('attaches after connection and expires stuck command tracking with bounded memory', () => {
    installMongoCommandTracing();
    expect(mongoose.connection.on).toHaveBeenCalledWith('connected', expect.any(Function));
    const client = new EventEmitter(); observeMongoCommands(client);
    jest.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(70000);
    client.emit('commandStarted', started);
    client.emit('commandStarted', { ...started, requestId: 2 });
    expect(end).toHaveBeenCalledWith({ name: 'TimeoutError' });
});

test('uses the actual responding server address rather than a replica-set seed when available', () => {
    const client = new EventEmitter(); observeMongoCommands(client);
    client.emit('commandStarted', { ...started, address: '[::1]:27018' });
    expect(tracing.beginDatabaseSpan).toHaveBeenCalledWith('mongodb.find', expect.objectContaining({ 'server.address': '::1', 'server.port': 27018 }));
    client.emit('commandSucceeded', { requestId: 1 });
    client.emit('commandStarted', { ...started, requestId: 2, address: 'invalid' });
    expect(tracing.beginDatabaseSpan).toHaveBeenLastCalledWith('mongodb.find', expect.objectContaining({ 'server.address': 'mongo.internal', 'server.port': 27017 }));
});
