export function imageSpecs(image: string, imageID?: string) {
    let registry = 'docker.io (DockerHub)';
    let repository = image;
    let tag = 'latest';
    const parts = image.split('/');
    if (parts.length > 1 && (parts[0].includes('.') || parts[0].includes(':') || parts[0] === 'localhost')) {
        registry = parts[0];
        repository = parts.slice(1).join('/');
    }
    const tagParts = repository.split(':');
    if (tagParts.length > 1) {
        repository = tagParts[0];
        tag = tagParts[1];
    }
    const match = imageID?.match(/sha256:([a-fA-F0-9]{64})/);
    const digest = match ? 'sha256:' + match[1] : '';
    return { registry, repository, tag, digest };
}

function metricNumber(value: number | string): number {
    if (typeof value === 'string') return Number.parseInt(value) || 0;
    return Number(value) || 0;
}

function relativeTime(secondsBack: number): string {
    if (secondsBack < 15) return 'Now';
    if (secondsBack < 60) return `-${secondsBack}s`;
    if (secondsBack < 3600) return `-${Math.round(secondsBack / 60)}m`;
    return `-${(secondsBack / 3600).toFixed(1)}h`;
}

export function metricChartData(cpu: Array<number | string>, memory: Array<number | string>, timestamps: number[], now: number) {
    const stableNow = timestamps.at(-1) || now;
    return cpu.map((value, index) => {
        const timestamp = timestamps[index] || (stableNow - (cpu.length - 1 - index) * 30000);
        return {
            index,
            cpu: metricNumber(value),
            memory: metricNumber(memory[index] || 0),
            relativeStr: relativeTime(Math.round((stableNow - timestamp) / 1000)),
            clockStr: new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
        };
    });
}

export function historyLoadingText(checking: boolean, fetching: boolean) {
    if (checking) return { title: 'Loading telemetry configuration...', detail: 'Checking storage backend' };
    if (fetching) return { title: 'Loading historical metrics...', detail: 'Connecting to Clickhouse long-term storage' };
    return { title: 'Synchronizing live APM stream...', detail: 'Collecting telemetry coordinates (updated every 30s)' };
}

export function historyIntervalLabel(interval: number): string {
    if (interval >= 60 && interval % 60 === 0) return interval / 60 + 'm';
    return interval + 's';
}
