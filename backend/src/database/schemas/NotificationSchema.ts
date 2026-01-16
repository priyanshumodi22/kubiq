import mongoose, { Schema, Document } from 'mongoose';
import { NotificationChannel } from '../../types';

export interface INotificationDocument extends Omit<NotificationChannel, 'id'>, Document {
    _id: mongoose.Types.ObjectId;
}

const NotificationSchema: Schema = new Schema({
    name: { type: String, required: true },
    type: { type: String, enum: ['webhook', 'email'], required: true },
    config: { type: Schema.Types.Mixed, required: true }, // Flexible config based on type
    events: {
        up: { type: Boolean, default: true },
        down: { type: Boolean, default: true }
    },
    enabled: { type: Boolean, default: true },
    lastTriggered: { type: Number }
});

NotificationSchema.virtual('id').get(function(this: INotificationDocument) {
    return this._id.toHexString();
});

NotificationSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
        delete ret._id;
    }
});

export const NotificationModel = mongoose.model<INotificationDocument>('Notification', NotificationSchema);
