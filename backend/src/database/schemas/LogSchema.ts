import mongoose, { Schema, Document } from 'mongoose';
import { retentionSeconds } from '../../utils/RetentionPolicy';

export interface ILog extends Document {
    serviceName: string;
    sourceName: string;
    timestamp: Date;
    level: string;
    message: string;
    traceId?: string;
    spanId?: string;
    eventId?: string;
    metadata?: Record<string, any>;
}

const logSchema = new Schema<ILog>({
    serviceName: { type: String, required: true, index: true },
    sourceName: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true },
    level: { type: String, required: true, index: true },
    message: { type: String, required: true },
    traceId: { type: String },
    spanId: { type: String },
    eventId: { type: String },
    metadata: { type: Schema.Types.Mixed }
}, { autoIndex: false });

// Compound index for querying logs by service and time efficiently
logSchema.index({ serviceName: 1, timestamp: -1 });

// Text index for fast full-text searching on the message
logSchema.index({ message: 'text' });

// TTL index to automatically delete old logs
const logTTL = retentionSeconds('LOG'); // Default 7 days
logSchema.index({ timestamp: 1 }, { expireAfterSeconds: logTTL });

export const LogModel = mongoose.model<ILog>('Log', logSchema);
