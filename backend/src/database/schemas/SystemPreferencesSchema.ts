import mongoose, { Schema, Document } from 'mongoose';

export interface IkvSystemConfigDoc extends Document {
    key: string;
    value: any;
}

const KvSystemConfigSchema = new Schema<IkvSystemConfigDoc>({
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true }
});

// Use a different model name 'SystemPreferences' to avoid conflict with 'SystemConfig' (dashboard settings)
export const SystemPreferencesModel = mongoose.models.SystemPreferences || mongoose.model<IkvSystemConfigDoc>('SystemPreferences', KvSystemConfigSchema);
