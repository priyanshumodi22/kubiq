import { IUserRepository } from '../../interfaces/IUserRepository';
import { User, UserRole } from '../../../types';
import { UserModel } from '../../schemas/UserSchema';

export class MongoUserRepository implements IUserRepository {
  async initialize(): Promise<void> {
    // Idempotent, access-preserving migration: legacy users retain their
    // existing single role as their first multi-role assignment.
    const legacyUsers = await UserModel.find({ $or: [{ roles: { $exists: false } }, { roles: null }, { roles: { $size: 0 } }] }).select('_id role').lean();
    await Promise.all(legacyUsers.map(user => UserModel.updateOne(
      { _id: user._id },
      { $set: { roles: [user.role || 'kubiq-viewer'] } }
    )));
  }

  async findByUsername(username: string): Promise<User | null> {
    const user = await UserModel.findOne({ username }).lean();
    return user ? this.mapToUser(user) : null;
  }

  async findById(id: string): Promise<User | null> {
    const user = await UserModel.findById(id).lean();
    return user ? this.mapToUser(user) : null;
  }

  async createUser(user: Omit<User, 'id' | 'createdAt' | 'lastLogin'>): Promise<User> {
    const userDoc = {
      ...user,
      password: user.passwordHash
    };
    const newUser = new UserModel(userDoc);
    await newUser.save();
    return this.mapToUser(newUser.toObject());
  }

  async updateUserRole(id: string, role: UserRole): Promise<User> {
    const updated = await UserModel.findByIdAndUpdate(
        id,
        { $set: { role, roles: [role] } },
        { new: true }
    ).lean();

    if (!updated) throw new Error(`User ${id} not found`);
    return this.mapToUser(updated);
  }

  async updateUserRoles(id: string, roles: string[]): Promise<User> {
    const normalized = [...new Set(roles.map(role => role.trim()).filter(Boolean))];
    if (normalized.length === 0) throw new Error('At least one role is required');
    const updated = await UserModel.findByIdAndUpdate(
      id,
      { $set: { role: normalized[0], roles: normalized } },
      { new: true }
    ).lean();
    if (!updated) throw new Error(`User ${id} not found`);
    return this.mapToUser(updated);
  }

  async deleteUser(id: string): Promise<void> {
    await UserModel.findByIdAndDelete(id);
  }

  async updateUserStatus(id: string, enabled: boolean): Promise<User> {
      const updated = await UserModel.findByIdAndUpdate(
          id,
          { $set: { enabled } },
          { new: true }
      ).lean();

      if (!updated) throw new Error(`User ${id} not found`);
      return this.mapToUser(updated);
  }

  async getAllUsers(): Promise<User[]> {
    const users = await UserModel.find().lean();
    return users.map(this.mapToUser);
  }

  async updateLastLogin(id: string): Promise<void> {
    await UserModel.findByIdAndUpdate(id, { $set: { lastLogin: Date.now() } });
  }

  private mapToUser(doc: any): User {
      return {
          id: doc._id.toString(),
          username: doc.username,
          passwordHash: doc.password, // Mapped from DB password field
          email: doc.email,
          avatarUrl: doc.avatarUrl,
          firstName: doc.firstName,
          lastName: doc.lastName,
          role: doc.role,
          roles: Array.isArray(doc.roles) && doc.roles.length ? doc.roles : [doc.role],
          allowedNamespaces: doc.allowedNamespaces,
          createdAt: doc.createdAt,
          lastLogin: doc.lastLogin,
          enabled: doc.enabled !== false
      };
  }
  async updateUser(id: string, user: Partial<User>): Promise<User> {
    const updateQuery: any = {};
    if (user.username) updateQuery.username = user.username;
    if (user.email !== undefined) updateQuery.email = user.email;
    if (user.avatarUrl !== undefined) updateQuery.avatarUrl = user.avatarUrl;
    if (user.allowedNamespaces !== undefined) updateQuery.allowedNamespaces = user.allowedNamespaces;
    
    const updated = await UserModel.findByIdAndUpdate(
        id,
        { $set: updateQuery },
        { new: true }
    ).lean();

    if (!updated) throw new Error(`User ${id} not found`);
    return this.mapToUser(updated);
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
      await UserModel.findByIdAndUpdate(id, { $set: { password: passwordHash } });
  }
}
