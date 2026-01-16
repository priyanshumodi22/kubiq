import mongoose, { Schema, Document } from 'mongoose';
import { SystemConfig } from '../../types';

export interface ISystemConfigDocument extends SystemConfig, Document {
    _id: mongoose.Types.ObjectId;
}

const SystemConfigSchema: Schema = new Schema({
    key: { type: String, default: 'main', unique: true }, // Singleton pattern using a known key
    dashboardTitle: { type: String, default: 'Kubiq Dashboard' },
    slug: { type: String, default: 'status' }
});

SystemConfigSchema.virtual('id').get(function(this: ISystemConfigDocument) {
    // SystemConfig doesn't really use ID in logic but good for consistency
    return this._id.toHexString();
});

export const SystemConfigModel = mongoose.model<ISystemConfigDocument>('SystemConfig', SystemConfigSchema);
