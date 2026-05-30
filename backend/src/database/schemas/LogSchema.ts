import mongoose, { Schema, Document } from 'mongoose';
import { parseTTLToSeconds } from '../../utils/TTLParser';

export interface ILog extends Document {
    serviceName: string;
    sourceName: string;
    timestamp: Date;
    level: string;
    message: string;
    metadata?: Record<string, any>;
}

const logSchema = new Schema<ILog>({
    serviceName: { type: String, required: true, index: true },
    sourceName: { type: String, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    level: { type: String, required: true, index: true },
    message: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed }
});

// Compound index for querying logs by service and time efficiently
logSchema.index({ serviceName: 1, timestamp: -1 });

// Text index for fast full-text searching on the message
logSchema.index({ message: 'text' });

// TTL index to automatically delete old logs
const logTTL = parseTTLToSeconds(process.env.LOG_RETENTION_PERIOD, 7 * 24 * 60 * 60); // Default 7 days
logSchema.index({ timestamp: 1 }, { expireAfterSeconds: logTTL });

export const LogModel = mongoose.model<ILog>('Log', logSchema);
