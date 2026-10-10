import type { CoreV1Api, User } from '@kubernetes/client-node';
import type { RequestOptions } from 'https';

/** Short-lived credentials for the dedicated reader; never falls back to the host identity. */
export class KubiReaderAuth {
    private token = '';
    private expiresAt = 0;
    private pending?: Promise<void>;

    constructor(private readonly api: CoreV1Api, private readonly namespace: string) {}

    isAuthProvider(user: User): boolean {
        return user.name === 'kubi-readonly';
    }

    async applyAuthentication(_user: User, opts: RequestOptions): Promise<void> {
        if (Date.now() >= this.expiresAt - 60_000) {
            if (!this.pending) {
                this.pending = this.refresh().finally(() => { this.pending = undefined; });
            }
            await this.pending;
        }
        opts.headers = { ...opts.headers, Authorization: `Bearer ${this.token}` };
    }

    private async refresh(): Promise<void> {
        try {
            const result = await this.api.createNamespacedServiceAccountToken({
                namespace: this.namespace,
                name: 'kubi-readonly',
                body: { apiVersion: 'authentication.k8s.io/v1', kind: 'TokenRequest', spec: { audiences: [], expirationSeconds: 3600 } },
            });
            const expiration = new Date(result.status?.expirationTimestamp || 0).getTime();
            if (!result.status?.token || !Number.isFinite(expiration) || expiration <= Date.now() + 60_000) throw new Error('Invalid token');
            this.token = result.status.token;
            this.expiresAt = expiration;
        } catch {
            this.token = '';
            this.expiresAt = 0;
            throw new Error('kubi read-only Kubernetes credentials unavailable');
        }
    }
}
