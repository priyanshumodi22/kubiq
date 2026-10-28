
import { RoleDefinition, SystemMetrics } from '../../types';

export type LicenseActivation = {
  keyFingerprint: string;
  activationId: string;
};

/** Encrypted at the service layer before persistence; never expose this record to a client. */
export type KubiAiConfigRecord = {
  provider: 'gemini' | 'openai' | 'anthropic';
  model: string;
  encryptedApiKey: string;
  updatedAt: number;
};

export type RbacConfigRecord = {
  version: 1;
  roles: RoleDefinition[];
  updatedAt: number;
};

export interface KubernetesLogSource {
  id: string;
  name: string;
  namespace: string;
  kind: 'service' | 'deployment' | 'statefulset' | 'daemonset' | 'replicaset' | 'job' | 'cronjob' | 'replicationcontroller' | 'pod' | 'namespace';
  resource: string;
  container?: string;
  updatedAt: number;
}
export interface KubernetesLogConfig { version: 1; sources: KubernetesLogSource[]; updatedAt: number }

export interface ISystemRepository {
  getKubernetesLogConfig(): Promise<KubernetesLogConfig | null>;
  saveKubernetesLogConfig(config: KubernetesLogConfig): Promise<void>;
  initialize(): Promise<void>;
  saveMetrics(metrics: SystemMetrics): Promise<void>;
  getMetricsHistory(limit?: number): Promise<SystemMetrics[]>;
  getStorageConfig(): Promise<{ allowedMounts: string[] }>;
  updateStorageConfig(config: { allowedMounts: string[] }): Promise<void>;
  getApmConfig(): Promise<{ ignoredRoutes: string[] }>;
  updateApmConfig(config: { ignoredRoutes: string[] }): Promise<void>;
  getLicenseActivation(): Promise<LicenseActivation | null>;
  saveLicenseActivation(activation: LicenseActivation): Promise<void>;
  getKubiAiConfig(): Promise<KubiAiConfigRecord | null>;
  saveKubiAiConfig(config: KubiAiConfigRecord): Promise<void>;
  getRbacConfig(): Promise<RbacConfigRecord | null>;
  saveRbacConfig(config: RbacConfigRecord): Promise<void>;
}
