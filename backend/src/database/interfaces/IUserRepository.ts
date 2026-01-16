import { User, UserRole } from '../../types';

export interface IUserRepository {
  initialize(): Promise<void>;
  
  findByUsername(username: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  
  createUser(user: Omit<User, 'id' | 'createdAt' | 'lastLogin'>): Promise<User>;
  updateUser(id: string, user: Partial<User>): Promise<User>;
  updatePassword(id: string, passwordHash: string): Promise<void>;
  updateUserRole(id: string, role: string): Promise<User>;
  updateUserStatus(id: string, enabled: boolean): Promise<User>;
  deleteUser(id: string): Promise<void>;
  
  getAllUsers(): Promise<User[]>;
  updateLastLogin(id: string): Promise<void>;
}
