import mongoose from 'mongoose';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { mongoTraceContext } from './mongoTraceContext';
jest.mock('mongoose', () => ({ __esModule: true, default: { models: {} } }));
beforeEach(() => { for (const key of Object.keys(mongoose.models)) delete mongoose.models[key]; });
test('uses actual model collection and connection metadata, including repository-specific config models', () => {
    const models = ['Service', 'User', 'Passkey', 'Notification', 'ApmSpan', 'Log', 'AuditLog', 'KubiConversation', 'SystemConfig', 'SystemMetrics', 'SystemPreferences'];
    for (const name of models) mongoose.models[name] = { collection: { collectionName: name.toLowerCase() }, db: { name: 'kubiq', host: 'mongodb.internal', port: 27017, password: 'SYNTHETIC_SECRET', uri: 'SYNTHETIC_SECRET' } } as unknown as mongoose.Model<unknown>;
    for (const [repository, operation, model] of [['services', 'getAllServices', 'Service'], ['services', 'getSystemConfig', 'SystemConfig'], ['system', 'getMetricsHistory', 'SystemMetrics'], ['system', 'getStorageConfig', 'SystemPreferences'], ['users', 'findById', 'User'], ['passkeys', 'read', 'Passkey'], ['notifications', 'read', 'Notification'], ['traces', 'read', 'ApmSpan'], ['logs', 'read', 'Log'], ['audit', 'read', 'AuditLog'], ['conversations', 'read', 'KubiConversation']]) {
        expect(mongoTraceContext(repository, operation)).toEqual({ 'db.system.name': 'mongodb', 'code.namespace': 'kubiq.repositories.' + repository, 'code.function.name': operation, 'db.collection.name': model.toLowerCase(), 'db.namespace': 'kubiq', 'server.address': 'mongodb.internal', 'server.port': 27017 });
    }
});
test('omits unavailable facts rather than fabricating a collection, host or database', () => {
    expect(mongoTraceContext('unknown', 'read')).toEqual({ 'db.system.name': 'mongodb', 'code.namespace': 'kubiq.repositories.unknown', 'code.function.name': 'read' });
    mongoose.models.User = { collection: {}, db: {} } as unknown as mongoose.Model<unknown>;
    expect(mongoTraceContext('users', 'read')).toEqual({ 'db.system.name': 'mongodb', 'code.namespace': 'kubiq.repositories.users', 'code.function.name': 'read' });
});
