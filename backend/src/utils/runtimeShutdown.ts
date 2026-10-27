import type { ServerResponse } from 'node:http';
import { withoutTracing } from 'kubiq-apm/runtime';
import { shutdownDeadline } from './shutdownDeadline';

interface ShutdownOptions {
    responses: ReadonlySet<ServerResponse>;
    stopBackground: () => void;
    stopStreams: () => void;
    ingestion: { stop: () => void; drain: () => Promise<void> };
    tracing: { shutdown: () => Promise<void> };
    server: { close: (callback: () => void) => unknown };
}

async function drainResponses(responses: ReadonlySet<ServerResponse>): Promise<void> {
    for (const response of responses) {
        if (String(response.getHeader('Content-Type')).includes('text/event-stream')) response.end();
    }
    if (responses.size === 0) return;
    await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timeout); clearInterval(poll); resolve(); };
        const timeout = setTimeout(done, 2000);
        const poll = setInterval(() => { if (responses.size === 0) done(); }, 20);
    });
    for (const response of responses) response.destroy();
}

/** Keep loopback ingestion open until the final tracing export has been persisted. */
export function shutdownRuntime(options: ShutdownOptions): Promise<boolean> {
    return shutdownDeadline(async () => {
        options.stopBackground();
        options.stopStreams();
        await drainResponses(options.responses);
        options.ingestion.stop();
        await withoutTracing(() => options.ingestion.drain());
        await options.tracing.shutdown();
        await withoutTracing(() => options.ingestion.drain());
        await new Promise<void>(resolve => options.server.close(resolve));
    });
}
