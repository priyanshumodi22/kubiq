import mongoose, { Schema, Document } from 'mongoose';
import { AuditLogEntry } from '../../services/AuditLogService';

export interface IAuditLogDocument extends Omit<AuditLogEntry, 'id'>, Document {
  id: string;
}

const AuditLogSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  timestamp: { type: String, required: true, index: true },
  user: { type: String, required: true, index: true },
  action: { type: String, required: true, index: true },
  target: { type: String, required: true },
  details: { type: String, required: false },
  ip: { type: String, required: false }
}, {
  timestamps: true
});

export const AuditLogModel = mongoose.models.AuditLog || mongoose.model<IAuditLogDocument>('AuditLog', AuditLogSchema);
