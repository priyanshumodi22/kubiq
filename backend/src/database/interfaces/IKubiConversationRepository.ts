export type KubiMessageRole = 'user' | 'assistant';

export interface KubiEvidenceReference {
  type: 'service' | 'logs' | 'trace' | 'kubernetes' | 'system' | 'notification-history' | 'audit' | 'documentation';
  label: string;
  href: string;
  occurredAt?: string;
}

export interface KubiConversationMessage {
  id: string;
  role: KubiMessageRole;
  content: string;
  createdAt: string;
  evidence?: KubiEvidenceReference[];
  clarification?: { options: string[]; slot?: 'auditTarget' | 'namespace'; question?: string };
  request?: { question: string; domains: string[] };
}

export interface KubiConversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  messages: KubiConversationMessage[];
}

export interface IKubiConversationRepository {
  initialize(): Promise<void>;
  createConversation(userId: string, title?: string): Promise<KubiConversation>;
  listConversations(userId: string, limit?: number): Promise<KubiConversation[]>;
  getConversation(userId: string, conversationId: string): Promise<KubiConversation | null>;
  appendMessage(userId: string, conversationId: string, message: KubiConversationMessage): Promise<KubiConversation | null>;
  deleteConversation(userId: string, conversationId: string): Promise<boolean>;
  clearConversations(userId: string): Promise<number>;
  cleanupExpired(): Promise<void>;
}
