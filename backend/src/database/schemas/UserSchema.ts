import mongoose, { Schema, Document } from 'mongoose';
import { User, UserRole } from '../../types';

export interface IUserDocument extends Omit<User, 'id'>, Document {
    _id: mongoose.Types.ObjectId;
}

const UserSchema: Schema = new Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    role: { type: String, enum: ['kubiq-admin', 'kubiq-viewer'], default: 'kubiq-viewer' },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Number },
    enabled: { type: Boolean, default: true }
});

// Virtual for 'id' to match interface
UserSchema.virtual('id').get(function(this: IUserDocument) {
    return this._id.toHexString();
});

UserSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
        delete ret._id;
        delete ret.password; // Never expose password
    }
});

export const UserModel = mongoose.model<IUserDocument>('User', UserSchema);
