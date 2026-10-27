import type { EventEmitter } from 'node:events';
import mongoose from 'mongoose';
import { beginDatabaseSpan, databaseDetailsEnabled, queryDetails, type DatabaseSpan } from './databaseSpan';
interface Started { requestId: number; commandName: string; databaseName: string; address?: string; command: Record<string, unknown> }
interface Completed { requestId: number; reply?: { cursor?: { firstBatch?: unknown[]; nextBatch?: unknown[] }; n?: number; nModified?: number }; failure?: { code?: number; name?: string } }
const observed = new WeakSet<object>();
const commands = new Set(['find', 'aggregate', 'insert', 'update', 'delete', 'findandmodify', 'count', 'distinct', 'getmore']);
function commandAttributes(event: Started): Record<string, string | number> {
    const attributes: Record<string, string | number> = { 'db.system': 'mongodb', 'db.system.name': 'mongodb', 'db.namespace': event.databaseName, 'db.operation.name': event.commandName, 'code.namespace': 'mongodb.command', 'code.function.name': event.commandName };
    const collection = event.command[event.commandName];
    if (typeof collection === 'string') attributes['db.collection.name'] = collection;
    if (mongoose.connection.host) attributes['server.address'] = mongoose.connection.host;
    if (mongoose.connection.port) attributes['server.port'] = mongoose.connection.port;
    return attributes;
}
function expirePending(pending: Map<number, { span: DatabaseSpan; at: number; operation: string }>): void {
    for (const [id, item] of pending) {
        if (Date.now() - item.at <= 60000) continue;
        item.span.end({ name: 'TimeoutError' });
        pending.delete(id);
    }
}
export function observeMongoCommands(client: EventEmitter): void {
    if (observed.has(client)) return;
    observed.add(client);
    const pending = new Map<number, { span: DatabaseSpan; at: number; operation: string }>();
    client.on('commandStarted', (event: Started) => {
        try {
            if (!databaseDetailsEnabled() || !commands.has(event.commandName.toLowerCase())) return;
            expirePending(pending);
            if (pending.size >= 1024) return;
            const attributes = commandAttributes(event);
            const span = beginDatabaseSpan('mongodb.' + event.commandName, attributes);
            if (!span) return;
            span.setAttributes({ 'db.query.text': queryDetails(event.command) });
            pending.set(event.requestId, { span, at: Date.now(), operation: event.commandName.toLowerCase() });
        } catch { /* Observability cannot fail the database command. */ }
    });
    const finish = (event: Completed) => {
        const item = pending.get(event.requestId);
        if (!item) return;
        pending.delete(event.requestId);
        try {
            const cursor = event.reply?.cursor;
            const rows = cursor?.firstBatch || cursor?.nextBatch;
            if (rows) item.span.setAttributes({ 'db.response.returned_rows': rows.length });
            if (typeof event.reply?.nModified === 'number') item.span.setAttributes({ 'db.response.affected_rows': event.reply.nModified });
            else if (typeof event.reply?.n === 'number') item.span.setAttributes({ [item.operation === 'count' ? 'db.response.returned_rows' : 'db.response.affected_rows']: event.reply.n });
            if (typeof event.failure?.code === 'number') item.span.setAttributes({ 'db.response.status_code': event.failure.code });
        } catch { /* The application still receives the original database result. */ }
        finally { try { item.span.end(event.failure); } catch { /* Fail open. */ } }
    };
    client.on('commandSucceeded', finish);
    client.on('commandFailed', finish);
}
export function installMongoCommandTracing(): void {
    if (!databaseDetailsEnabled()) return;
    mongoose.connection.on('connected', () => observeMongoCommands(mongoose.connection.getClient()));
    if (mongoose.connection.readyState === 1) observeMongoCommands(mongoose.connection.getClient());
}
