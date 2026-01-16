import fs from 'fs';
import path from 'path';
import { IUserRepository } from '../../interfaces/IUserRepository';
import { User, UserRole } from '../../../types';

export class JsonUserRepository implements IUserRepository {
  private dataDir: string;
  private users: Map<string, User> = new Map();

  constructor() {
    this.dataDir = process.env.DATA_DIR || './data';
  }

  async initialize(): Promise<void> {
    this.loadUsers();
  }

  private loadUsers(): void {
    try {
      if (!fs.existsSync(this.dataDir)) {
          fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const dataFile = path.join(this.dataDir, 'users.json');
      if (fs.existsSync(dataFile)) {
        const fileContent = fs.readFileSync(dataFile, 'utf-8');
        const users = JSON.parse(fileContent);
        users.forEach((user: User) => {
          this.users.set(user.id, user);
        });
        console.log(`👤 Loaded ${this.users.size} users from JSON`);
      }
    } catch (error) {
      console.error('❌ Error loading users:', error);
    }
  }

  private saveUsers(): void {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      const dataFile = path.join(this.dataDir, 'users.json');
      const data = Array.from(this.users.values());
      fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('❌ Error saving users:', error);
    }
  }

  async findByUsername(username: string): Promise<User | null> {
    for (const user of this.users.values()) {
        if (user.username === username) return user;
    }
    return null;
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async createUser(user: Omit<User, 'id' | 'createdAt' | 'lastLogin'>): Promise<User> {
    const id = Date.now().toString(); // Simple ID
    const newUser: User = {
        id,
        username: user.username,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role,
        createdAt: Date.now(),
        lastLogin: undefined,
        enabled: true
    };
    
    this.users.set(id, newUser);
    this.saveUsers();
    return newUser;
  }

  async updateUserRole(id: string, role: UserRole): Promise<User> {
    const user = this.users.get(id);
    if (!user) throw new Error('User not found');
    
    user.role = role;
    this.users.set(id, user);
    this.saveUsers();
    return user;
  }

  async updateUserStatus(id: string, enabled: boolean): Promise<User> {
      const user = this.users.get(id);
      if (!user) throw new Error('User not found');
      
      user.enabled = enabled;
      this.users.set(id, user);
      this.saveUsers();
      return user;
  }

  async deleteUser(id: string): Promise<void> {
    if (this.users.delete(id)) {
        this.saveUsers();
    }
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
  
  async updateLastLogin(id: string): Promise<void> {
      const user = this.users.get(id);
      if (user) {
          user.lastLogin = Date.now();
          this.users.set(id, user);
          this.saveUsers();
      }
  }
  async updateUser(id: string, user: Partial<User>): Promise<User> {
      const existing = this.users.get(id);
      if (!existing) throw new Error('User not found');
      
      if (user.username) existing.username = user.username;
      if (user.email) existing.email = user.email;
      
      this.users.set(id, existing);
      this.saveUsers();
      return existing;
  }

  async updatePassword(id: string, passwordHash: string): Promise<void> {
      const existing = this.users.get(id);
      if (existing) {
          existing.passwordHash = passwordHash;
          this.users.set(id, existing);
          this.saveUsers();
      }
  }
}
