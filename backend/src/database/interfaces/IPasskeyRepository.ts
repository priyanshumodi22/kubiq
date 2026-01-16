
import { Passkey } from '../../types';

export interface IPasskeyRepository {
  initialize(): Promise<void>;
  create(passkey: Passkey): Promise<Passkey>;
  findById(credentialId: string): Promise<Passkey | null>;
  findByUserId(userId: string): Promise<Passkey[]>;
  updateCounter(credentialId: string, newCounter: number): Promise<void>;
  updateName(credentialId: string, name: string): Promise<void>;
  delete(credentialId: string): Promise<boolean>;
}
