import { KubeMetric } from '../hooks/useKubernetes';

export function parseCpu(cpu: string): string {
    if (!cpu) return '—';
    if (cpu.endsWith('n')) return `${Math.round(Number.parseInt(cpu) / 1_000_000)}m`;
    return cpu;
}

export function parseMemory(mem: string): string {
    if (!mem) return '—';
    if (mem.endsWith('Ki')) return `${Math.round(Number.parseInt(mem) / 1024)} Mi`;
    if (mem.endsWith('Gi')) return `${(Number.parseFloat(mem) * 1024).toFixed(0)} Mi`;
    if (mem.endsWith('Mi')) return mem;
    return mem;
}

export function getMetricForPod(metrics: KubeMetric[], podName: string) {
    const m = metrics.find(m => m.name === podName);
    if (!m?.containers.length) return { cpu: '—', memory: '—' };
    let totalCpuM = 0;
    let totalMemMi = 0;
    m.containers.forEach(c => {
        const cpu = c.cpu;
        if (cpu.endsWith('n')) totalCpuM += Number.parseInt(cpu) / 1_000_000;
        else if (cpu.endsWith('m')) totalCpuM += Number.parseInt(cpu);
        const mem = c.memory;
        if (mem.endsWith('Ki')) totalMemMi += Number.parseInt(mem) / 1024;
        else if (mem.endsWith('Mi')) totalMemMi += Number.parseFloat(mem);
        else if (mem.endsWith('Gi')) totalMemMi += Number.parseFloat(mem) * 1024;
    });
    return {
        cpu: `${Math.round(totalCpuM)}m`,
        memory: `${Math.round(totalMemMi)} Mi`,
    };
}

export function timeAgo(iso: string | null): string {
    if (!iso) return '—';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return `${Math.round(diff)}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
}

export function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
        console.log('Copied to clipboard');
    });
}
