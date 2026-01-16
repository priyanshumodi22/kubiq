import { IPasskeyRepository } from '../../interfaces/IPasskeyRepository';
import { Passkey } from '../../../types';
import { PasskeyModel, PasskeyDocument } from '../../schemas/PasskeySchema';
import mongoose from 'mongoose';

export class MongoPasskeyRepository implements IPasskeyRepository {
  async initialize(): Promise<void> {
    // Mongoose connection is handled globally or in DatabaseFactory/App initialization
    // But we can ensure indexes differ if needed
    if (mongoose.connection.readyState !== 1) {
      console.warn('⚠️ MongoPasskeyRepository initialized but Mongoose is not connected.');
    }
  }

  async create(passkey: Passkey): Promise<Passkey> {
    const doc = await PasskeyModel.create(passkey);
    return this.mapToPasskey(doc);
  }

  async findById(id: string): Promise<Passkey | null> {
    const doc = await PasskeyModel.findOne({ id });
    return doc ? this.mapToPasskey(doc) : null;
  }

  async findByUserId(userId: string): Promise<Passkey[]> {
    const docs = await PasskeyModel.find({ userId });
    return docs.map(doc => this.mapToPasskey(doc));
  }

  async updateCounter(id: string, newCounter: number): Promise<void> {
    await PasskeyModel.updateOne({ id }, { $set: { counter: newCounter } });
  }

  async updateName(id: string, name: string): Promise<void> {
    await PasskeyModel.updateOne({ id }, { $set: { name } });
  }

  async delete(id: string): Promise<boolean> {
    const result = await PasskeyModel.deleteOne({ id });
    return result.deletedCount === 1;
  }

  private mapToPasskey(doc: PasskeyDocument): Passkey {
    return {
      id: doc.id,
      publicKey: doc.publicKey,
      userId: doc.userId,
      webAuthnUserID: doc.webAuthnUserID,
      name: doc.name || 'My Passkey',
      counter: doc.counter,
      deviceType: doc.deviceType as any,
      backedUp: doc.backedUp,
      transports: doc.transports as any[],
      createdAt: doc.createdAt,
    };
  }
}
