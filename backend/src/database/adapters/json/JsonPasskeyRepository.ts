
import fs from 'fs/promises';
import path from 'path';
import { IPasskeyRepository } from '../../interfaces/IPasskeyRepository';
import { Passkey } from '../../../types';

export class JsonPasskeyRepository implements IPasskeyRepository {
  private dataDir: string;
  private filePath: string;
  private passkeys: Map<string, Passkey>; // credentialId -> Passkey

  constructor() {
    this.dataDir = process.env.DATA_DIR || './data';
    this.filePath = path.join(this.dataDir, 'passkeys.json');
    this.passkeys = new Map();
  }

  public async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      try {
        const data = await fs.readFile(this.filePath, 'utf-8');
        const json = JSON.parse(data);
        if (Array.isArray(json)) {
          json.forEach((p: Passkey) => this.passkeys.set(p.id, p));
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          console.error('Error reading passkeys.json:', error);
        }
        // If file doesn't exist, start empty
      }
    } catch (error) {
      console.error('Error initializing JsonPasskeyRepository:', error);
    }
  }

  private async save(): Promise<void> {
    try {
      const data = Array.from(this.passkeys.values());
      await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving passkeys.json:', error);
    }
  }

  public async create(passkey: Passkey): Promise<Passkey> {
    this.passkeys.set(passkey.id, passkey);
    await this.save();
    return passkey;
  }

  public async findById(credentialId: string): Promise<Passkey | null> {
    return this.passkeys.get(credentialId) || null;
  }

  public async findByUserId(userId: string): Promise<Passkey[]> {
    return Array.from(this.passkeys.values()).filter((p) => p.userId === userId);
  }

  public async updateCounter(credentialId: string, newCounter: number): Promise<void> {
    const passkey = this.passkeys.get(credentialId);
    if (passkey) {
      passkey.counter = newCounter;
      await this.save();
    }
  }

  public async updateName(credentialId: string, name: string): Promise<void> {
    const passkey = this.passkeys.get(credentialId);
    if (passkey) {
      passkey.name = name;
      await this.save();
    }
  }

  public async delete(credentialId: string): Promise<boolean> {
    const deleted = this.passkeys.delete(credentialId);
    if (deleted) {
      await this.save();
    }
    return deleted;
  }
}
