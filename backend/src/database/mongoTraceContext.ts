import mongoose from 'mongoose';
const modelNames: Readonly<Record<string, string>> = { services: 'Service', users: 'User', passkeys: 'Passkey', notifications: 'Notification', traces: 'ApmSpan', logs: 'Log', audit: 'AuditLog', conversations: 'KubiConversation' };
function modelName(repository: string, operation: string): string | undefined {
    if (repository === 'system') return ['saveMetrics', 'getMetricsHistory'].includes(operation) ? 'SystemMetrics' : 'SystemPreferences';
    if (repository === 'services' && ['getSystemConfig', 'saveSystemConfig'].includes(operation)) return 'SystemConfig';
    return modelNames[repository];
}
/** Describe the actual registered model/connection, never arguments or a connection URI. */
export function mongoTraceContext(repository: string, operation: string): Record<string, string | number> {
    const name = modelName(repository, operation);
    const model = name ? mongoose.models[name] : undefined;
    const connection = model?.db;
    const values: Record<string, string | number> = { 'db.system.name': 'mongodb', 'code.namespace': 'kubiq.repositories.' + repository, 'code.function.name': operation };
    if (model?.collection.collectionName) values['db.collection.name'] = model.collection.collectionName;
    if (connection?.name) values['db.namespace'] = connection.name;
    if (connection?.host) values['server.address'] = connection.host;
    if (connection?.port) values['server.port'] = connection.port;
    return values;
}
