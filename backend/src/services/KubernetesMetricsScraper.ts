import { KubernetesService } from './KubernetesService';
import { clickhouseService } from './ClickhouseService';

const parseCpu = (cpuStr: string) => {
    if (!cpuStr) return 0;
    if (cpuStr.endsWith('n')) return parseInt(cpuStr) / 1000000;
    if (cpuStr.endsWith('m')) return parseInt(cpuStr);
    return parseInt(cpuStr) * 1000;
};

const parseMemory = (memStr: string) => {
    if (!memStr) return 0;
    if (memStr.endsWith('Ki')) return parseInt(memStr) / 1024;
    if (memStr.endsWith('Mi')) return parseInt(memStr);
    if (memStr.endsWith('Gi')) return parseInt(memStr) * 1024;
    return parseInt(memStr) / (1024 * 1024);
};

export class KubernetesMetricsScraper {
    private interval: NodeJS.Timeout | null = null;
    
    start() {
        if (!clickhouseService.isConfigured()) {
            console.log('KubernetesMetricsScraper: Clickhouse not configured, skipping start.');
            return;
        }
        
        const scrapeIntervalSec = parseInt(process.env.APM_SCRAPE_INTERVAL_SECONDS || '60', 10);
        console.log(`KubernetesMetricsScraper: Starting background metric scraper (${scrapeIntervalSec}-second intervals).`);
        
        // Run immediately then on the interval
        this.scrape();
        this.interval = setInterval(() => this.scrape(), scrapeIntervalSec * 1000);
    }
    
    stop() {
        if (this.interval) clearInterval(this.interval);
    }
    
    private async scrape() {
        const k8s = KubernetesService.getInstance();
        if (!k8s.available) return;
        
        const ctx = k8s.defaultContext;
        if (!ctx) return;
        
        try {
            const namespaces = await k8s.getNamespaces(ctx);
            const metricsToInsert = [];
            const timestamp = new Date();
            
            for (const ns of namespaces) {
                try {
                    const metrics = await k8s.getPodMetrics(ctx, ns);
                    for (const pod of metrics) {
                        let cpuTotal = 0;
                        let memTotal = 0;
                        
                        for (const c of pod.containers) {
                            cpuTotal += parseCpu(c.cpu || '0m');
                            memTotal += parseMemory(c.memory || '0Mi');
                        }
                        
                        metricsToInsert.push({
                            cluster_context: ctx,
                            namespace: ns,
                            pod_name: pod.name,
                            cpu_m: Math.round(cpuTotal),
                            memory_mi: Math.round(memTotal),
                            timestamp
                        });
                    }
                } catch (nsErr) {
                    console.error(`KubernetesMetricsScraper: Error scraping ns ${ns}:`, nsErr);
                }
            }
            
            if (metricsToInsert.length > 0) {
                await clickhouseService.insertPodMetrics(metricsToInsert);
            }
        } catch (err) {
            console.error('KubernetesMetricsScraper: Error scraping metrics:', err);
        }
    }
}

export const kubernetesMetricsScraper = new KubernetesMetricsScraper();
