/** Serial, bounded best-effort export. Never sends payloads or errors to logs. */
class BoundedProcessor {
    constructor(exporter, options = {}) {
        this.exporter = exporter;
        this.queue = [];
        this.pending = 0;
        this.closed = false;
        this.failed = 0;
        this.dropped = 0;
        this.exported = 0;
        this.lastReport = 0;
        this.timeout = options.timeoutMillis ?? 5000;
        this.capacity = options.maxQueueSize ?? 1024;
        this.batchSize = options.maxExportBatchSize ?? 50;
        this.transform = options.transform ?? (span => span);
        this.report = options.report ?? (counts => console.warn('[kubiq-apm]', JSON.stringify(counts)));
        this.timer = setInterval(() => { void this.forceFlush(); }, options.scheduledDelayMillis ?? 2000);
        this.timer.unref();
    }
    onStart() { /* Context is supplied by the provider. */ }
    onEnd(span) {
        if (this.closed || this.queue.length + this.pending >= this.capacity) {
            this.dropped++;
            this.notify();
            return;
        }
        try { this.queue.push(this.transform(span)); }
        catch { this.dropped++; this.notify(); }
    }
    counts() { return { queued: this.queue.length, pending: this.pending, exported: this.exported, failed: this.failed, dropped: this.dropped }; }
    notify() {
        if (Date.now() - this.lastReport < 60000) return;
        this.lastReport = Date.now();
        try { this.report(this.counts()); } catch { /* Diagnostics cannot interrupt requests. */ }
    }
    send(batch) {
        this.pending = batch.length;
        return new Promise(resolve => {
            let complete = false;
            const done = result => {
                if (complete) return;
                complete = true;
                clearTimeout(timer);
                this.pending = 0;
                if (result?.code === 0) this.exported += batch.length;
                else { this.failed += batch.length; this.notify(); }
                resolve();
            };
            const timer = setTimeout(() => done({ code: 1 }), this.timeout);
            timer.unref();
            try { this.exporter.export(batch, done); }
            catch { done({ code: 1 }); }
        });
    }
    forceFlush() {
        if (this.flushing) return this.flushing;
        this.flushing = this.drain().finally(() => { this.flushing = undefined; });
        return this.flushing;
    }
    async drain() {
        const deadline = Date.now() + this.timeout;
        while (this.queue.length && Date.now() < deadline) await this.send(this.queue.splice(0, this.batchSize));
    }
    shutdown() {
        if (this.stopping) return this.stopping;
        this.closed = true;
        clearInterval(this.timer);
        this.stopping = this.stop();
        return this.stopping;
    }
    async stop() {
        let timeout;
        const drainAndClose = async () => { await this.forceFlush(); await this.exporter.shutdown(); };
        try {
            await Promise.race([drainAndClose().catch(() => {}), new Promise(resolve => { timeout = setTimeout(resolve, this.timeout); timeout.unref(); })]);
        } finally {
            clearTimeout(timeout);
            this.dropped += this.queue.length;
            this.queue.length = 0;
        }
    }
}
module.exports = { BoundedProcessor };
