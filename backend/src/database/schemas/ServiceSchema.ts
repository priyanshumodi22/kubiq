import mongoose, { Schema, Document } from 'mongoose';
import { ServiceConfig, HealthCheck } from '../../types';

export interface IServiceDocument extends Omit<ServiceConfig, 'id'>, Document {
    _id: mongoose.Types.ObjectId;
    history: HealthCheck[];
}

const ServiceSchema: Schema = new Schema({
    name: { type: String, required: true, unique: true },
    endpoint: { type: String, required: true },
    type: { type: String, enum: ['http', 'tcp', 'icmp', 'mysql', 'mongodb'], default: 'http', required: true },
    interval: { type: Number, default: 30000 }, // ms
    timeout: { type: Number, default: 5000 },
    headers: { type: Map, of: String },
    enabled: { type: Boolean, default: true },
    
    // Status fields (cached from monitoring)
    status: { type: String, enum: ['healthy', 'unhealthy', 'unknown'], default: 'unknown' },
    lastCheck: { type: Number },
    responseTime: { type: Number },
    
    // SSL Monitoring
    ignoreSSL: { type: Boolean, default: false },
    sslExpiry: { type: Date, default: null },
    logPath: { type: String, required: false }, // Legacy
    logSources: [{
        id: { type: String, required: true },
        name: { type: String, required: true },
        path: { type: String, required: true }
    }],
    
    // History (embedded array for simplicity, capped could be better but array is fine for now)
    history: [{
        timestamp: Number,
        status: Number, // HTTP Status Code
        success: Boolean,
        responseTime: Number,
        error: String,
        data: Schema.Types.Mixed
    }]
});



ServiceSchema.virtual('id').get(function(this: IServiceDocument) {
    return this._id.toHexString();
});

ServiceSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
        delete ret._id;
        delete ret.history; // Don't return history by default unless asked
    }
});

export const ServiceModel = mongoose.model<IServiceDocument>('Service', ServiceSchema);
