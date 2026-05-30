import mongoose, { Schema, Document } from 'mongoose';
import { parseTTLToSeconds } from '../../utils/TTLParser';

export interface IApmSpanDocument extends Document {
    traceId: string;
    spanId: string;
    parentSpanId: string | null;
    serviceName: string;
    name: string;
    kind: string;
    startTimeUnixNano: number;
    endTimeUnixNano: number;
    durationMs: number;
    statusCode: number;
    attributes: Map<string, any>;
    timestamp: Date;
}

const ApmSpanSchema: Schema = new Schema(
    {
        traceId: { type: String, required: true, index: true },
        spanId: { type: String, required: true, unique: true },
        parentSpanId: { type: String, default: null, index: true }, // Index for fast tree building
        serviceName: { type: String, required: true, index: true },
        name: { type: String, required: true },
        kind: { type: String },
        startTimeUnixNano: { type: Number, required: true },
        endTimeUnixNano: { type: Number, required: true },
        durationMs: { type: Number, required: true, index: true }, // Index for finding slow queries
        statusCode: { type: Number, default: 0 },
        attributes: { type: Map, of: Schema.Types.Mixed },
        timestamp: { type: Date, required: true, index: true } // Index for time-series queries
    },
    {
        timestamps: false // We use our own timestamp based on the OTel data
    }
);

// We assume a capped collection isn't necessary initially, 
// but compound indexes help Analytics APIs greatly.
ApmSpanSchema.index({ serviceName: 1, timestamp: -1 });

// TTL index to automatically delete old APM spans
const apmTTL = parseTTLToSeconds(process.env.APM_RETENTION_PERIOD, 3 * 24 * 60 * 60); // Default 3 days
ApmSpanSchema.index({ timestamp: 1 }, { expireAfterSeconds: apmTTL });

export const ApmSpanModel = mongoose.models.ApmSpan || mongoose.model<IApmSpanDocument>('ApmSpan', ApmSpanSchema);
