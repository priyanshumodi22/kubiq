import mongoose, { Document, Schema } from 'mongoose';
import { KubiConversation, KubiConversationMessage } from '../interfaces/IKubiConversationRepository';

export interface IKubiConversationDocument extends Omit<KubiConversation, 'messages' | 'expiresAt'>, Document {
  expiresAt: Date;
  messages: KubiConversationMessage[];
}

const KubiMessageSchema = new Schema<KubiConversationMessage>({
  id: { type: String, required: true },
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },
  createdAt: { type: String, required: true },
  evidence: { type: [Schema.Types.Mixed], required: false },
  clarification: { type: Schema.Types.Mixed, required: false },
  request: { type: Schema.Types.Mixed, required: false },
}, { _id: false });

const KubiConversationSchema = new Schema<IKubiConversationDocument>({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true, index: true },
  // MongoDB removes conversations automatically after this timestamp.
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  messages: { type: [KubiMessageSchema], default: [] },
}, { timestamps: true });

KubiConversationSchema.index({ userId: 1, updatedAt: -1 });

export const KubiConversationModel = mongoose.models.KubiConversation ||
  mongoose.model<IKubiConversationDocument>('KubiConversation', KubiConversationSchema);
