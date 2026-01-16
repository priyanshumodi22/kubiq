import { IUserRepository } from '../../interfaces/IUserRepository';
import { User, UserRole } from '../../../types';
import { UserModel } from '../../schemas/UserSchema';

export class MongoUserRepository implements IUserRepository {
  async initialize(): Promise<void> {
    // Assumes connection established by ServiceRepository or generic init
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
        { $set: { role } },
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
          firstName: doc.firstName,
          lastName: doc.lastName,
          role: doc.role,
          createdAt: doc.createdAt,
          lastLogin: doc.lastLogin,
          enabled: doc.enabled !== false
      };
  }
  async updateUser(id: string, user: Partial<User>): Promise<User> {
    const updateQuery: any = {};
    if (user.username) updateQuery.username = user.username;
    if (user.email) updateQuery.email = user.email;
    
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
