import type { CoreV1Api } from '@kubernetes/client-node';
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import type { RequestOptions } from 'https';
import { KubiReaderAuth } from './KubiReaderAuth';

describe('kubi reader credentials', () => {
    afterEach(() => { jest.useRealTimers(); });

    it('uses only the dedicated account, caches and refreshes before expiry', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-10-11T00:00:00Z'));
        let calls = 0;
        const request = jest.fn<CoreV1Api['createNamespacedServiceAccountToken']>().mockImplementation(async () => ({ spec: { audiences: [] }, status: {
            token: `test-${++calls}`,
            expirationTimestamp: new Date(Date.now() + 3600_000),
        } }));
        const auth = new KubiReaderAuth({ createNamespacedServiceAccountToken: request } as unknown as CoreV1Api, 'kubiq-system');
        const opts: RequestOptions = {};
        await Promise.all([auth.applyAuthentication({ name: 'kubi-readonly' }, opts), auth.applyAuthentication({ name: 'kubi-readonly' }, {})]);
        expect(request).toHaveBeenCalledTimes(1);
        expect(request.mock.calls[0][0]).toMatchObject({ name: 'kubi-readonly', namespace: 'kubiq-system', body: { spec: { expirationSeconds: 3600 } } });
        expect(opts.headers).toEqual({ Authorization: 'Bearer test-1' });
        jest.advanceTimersByTime(3540_000);
        await auth.applyAuthentication({ name: 'kubi-readonly' }, opts);
        expect(request).toHaveBeenCalledTimes(2);
        expect(opts.headers).toEqual({ Authorization: 'Bearer test-2' });
        expect(auth.isAuthProvider({ name: 'kubiq' })).toBe(false);
    });

    it('fails closed without exposing upstream details', async () => {
        const request = jest.fn<CoreV1Api['createNamespacedServiceAccountToken']>().mockRejectedValue(new Error('sensitive upstream details'));
        const auth = new KubiReaderAuth({ createNamespacedServiceAccountToken: request } as unknown as CoreV1Api, 'kubiq-system');
        const opts: RequestOptions = {};
        await expect(auth.applyAuthentication({ name: 'kubi-readonly' }, opts)).rejects.toThrow('kubi read-only Kubernetes credentials unavailable');
        expect(opts.headers).toBeUndefined();
    });
});
