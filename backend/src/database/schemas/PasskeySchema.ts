import mongoose, { Schema, Document } from 'mongoose';
import { Passkey } from '../../types';

export interface PasskeyDocument extends Passkey, Document {
  id: string; // Override Document.id to match Passkey.id (credential ID)
  _id: mongoose.Types.ObjectId;
}

const PasskeySchema = new Schema<PasskeyDocument>(
  {
    id: { type: String, required: true, unique: true }, // Credential ID from WebAuthn
    publicKey: { type: String, required: true },
    userId: { type: String, required: true },
    webAuthnUserID: { type: String, required: true },
    name: { type: String, required: true, default: 'My Passkey' },
    counter: { type: Number, required: true },
    deviceType: { type: String, required: true },
    backedUp: { type: Boolean, required: true },
    transports: { type: [String], default: [] },
    createdAt: { type: Number, required: true },
  },
  {
    timestamps: true, // Mongoose adds createdAt/updatedAt automatically too, but we have explicit createdAt
    toJSON: {
      transform: (doc, ret: any) => {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Index for fast lookups
PasskeySchema.index({ userId: 1 });
PasskeySchema.index({ webAuthnUserID: 1 });

export const PasskeyModel = mongoose.model<PasskeyDocument>('Passkey', PasskeySchema);
