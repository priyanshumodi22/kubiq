import type { IncomingMessage, ServerResponse } from 'node:http';
export interface TracingHandle {
    enabled: boolean;
    forceFlush(): Promise<void>;
    shutdown(): Promise<void>;
    diagnostics(): { queued: number; pending: number; exported: number; failed: number; dropped: number };
}
export function startTracing(options?: { enabled?: boolean; endpoint?: string; token?: string; serviceName?: string; serviceVersion?: string; profile?: 'kubiq' | 'portfolio' }): TracingHandle;
export function traceRequest<T>(request: IncomingMessage & { route?: { path?: string } }, response: ServerResponse, action: () => T, options?: { route?: () => string }): T;
export function traceDependency<T>(name: string, action: () => T, attributes?: Record<string, string | number>): T;
export function withoutTracing<T>(action: () => T): T;
