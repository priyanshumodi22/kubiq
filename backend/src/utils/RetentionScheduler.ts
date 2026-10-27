import { withoutTracing } from 'kubiq-apm/runtime';
const jobs = new Set<NodeJS.Timeout>();

/** Bounded SQL sweeps without requiring a server-wide database event scheduler. */
export async function scheduleRetentionSweep(cleanup: () => Promise<void>): Promise<void> {
    await withoutTracing(cleanup);
    let running = false;
    const timer = setInterval(() => {
        if (running) return;
        running = true;
        withoutTracing(cleanup).catch(() => console.error('Telemetry retention sweep failed; retrying next minute'))
            .finally(() => { running = false; });
    }, 60_000);
    timer.unref();
    jobs.add(timer);
}

export function stopRetentionSweeps(): void {
    for (const timer of jobs) clearInterval(timer);
    jobs.clear();
}
