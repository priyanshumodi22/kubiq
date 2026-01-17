import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemMetricsDoc extends Document {
    cpuLoad: number;
    memoryUsed: number;
    memoryTotal: number;
    diskUsage: any;
    timestamp: Date;
}

const SystemMetricsSchema = new Schema<ISystemMetricsDoc>({
    cpuLoad: { type: Number, required: true },
    memoryUsed: { type: Number, required: true },
    memoryTotal: { type: Number, required: true },
    diskUsage: { type: Schema.Types.Mixed, required: true },
    timestamp: { type: Date, default: Date.now, index: true } // Indexed for history queries
});

// Check if model exists before compiling
export const SystemMetricsModel = mongoose.models.SystemMetrics || mongoose.model<ISystemMetricsDoc>('SystemMetrics', SystemMetricsSchema);
