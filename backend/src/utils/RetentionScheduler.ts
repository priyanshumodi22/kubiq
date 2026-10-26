const jobs = new Set<NodeJS.Timeout>();

/** Bounded SQL sweeps without requiring a server-wide database event scheduler. */
export async function scheduleRetentionSweep(cleanup: () => Promise<void>): Promise<void> {
    await cleanup();
    let running = false;
    const timer = setInterval(() => {
        if (running) return;
        running = true;
        cleanup().catch(error => console.error('Telemetry retention sweep failed; retrying next minute', error))
            .finally(() => { running = false; });
    }, 60_000);
    timer.unref();
    jobs.add(timer);
}

export function stopRetentionSweeps(): void {
    for (const timer of jobs) clearInterval(timer);
    jobs.clear();
}
