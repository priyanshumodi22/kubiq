import type { Model } from 'mongoose';

/** Upgrade only the timestamp index; never drop unrelated indexes or collections. */
export async function ensureRetentionIndex(model: Model<any>, seconds: number): Promise<void> {
    await model.createCollection();
    const indexes = await model.collection.listIndexes().toArray();
    const timestampIndex = indexes.find(index =>
        Object.keys(index.key).length === 1 && index.key.timestamp === 1);
    if (timestampIndex && timestampIndex.expireAfterSeconds !== seconds) {
        const database = model.db.db;
        if (!database) throw new Error('MongoDB is not connected for retention setup');
        await database.command({ collMod: model.collection.collectionName,
            index: { name: timestampIndex.name, expireAfterSeconds: seconds } });
    }
    // Also creates the TTL index on a fresh collection and the ordinary query indexes.
    await model.createIndexes();
    const verified = await model.collection.listIndexes().toArray();
    if (!verified.some(index => Object.keys(index.key).length === 1 &&
        index.key.timestamp === 1 && index.expireAfterSeconds === seconds)) {
        throw new Error(`Retention index verification failed for ${model.collection.collectionName}`);
    }
}
