import { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface PodMetricSample { cpu_m: number; memory_mi: number; timestamp_ms: number }
export interface PodMetricsHistory { cpu: number[]; memory: number[]; timestamps: number[] }

export function usePodMetricsHistory(namespace: string, podName: string | undefined, enabled: boolean) {
    const [clickhouseMetrics, setClickhouseMetrics] = useState<PodMetricsHistory | null>(null);
    const [refreshCountdown, setRefreshCountdown] = useState(60);
    const [scrapeIntervalSec, setScrapeIntervalSec] = useState(60);
    const [isFetchingHistory, setIsFetchingHistory] = useState(false);
    const [isCheckingConfig, setIsCheckingConfig] = useState(true);

    useEffect(() => {
        if (!enabled || !podName) return;
        let active = true;
        let inFlight = false;
        let intervalId: ReturnType<typeof setInterval> | undefined;
        let countdownId: ReturnType<typeof setInterval> | undefined;
        setClickhouseMetrics(null);
        setIsCheckingConfig(true);

        async function fetchHistory(interval: number) {
            if (!active || inFlight) return;
            inFlight = true;
            setIsFetchingHistory(true);
            setRefreshCountdown(interval);
            try {
                const data = await apiClient.getKubernetesPodMetricsHistory(namespace, podName!);
                if (active && Array.isArray(data)) {
                    const samples = data as PodMetricSample[];
                    setClickhouseMetrics({ cpu: samples.map(sample => sample.cpu_m), memory: samples.map(sample => sample.memory_mi), timestamps: samples.map(sample => sample.timestamp_ms) });
                }
            } catch {
                if (active) setClickhouseMetrics(null);
            } finally {
                inFlight = false;
                if (active) setIsFetchingHistory(false);
            }
        }

        async function initialize() {
            try {
                const status = await apiClient.getKubernetesStatus();
                if (!active) return;
                setIsCheckingConfig(false);
                const interval = status?.scrapeInterval || 60;
                setScrapeIntervalSec(interval);
                if (status?.clickhouseEnabled === false) return;
                void fetchHistory(interval);
                intervalId = setInterval(() => { void fetchHistory(interval); }, interval * 1000);
                countdownId = setInterval(() => setRefreshCountdown(previous => Math.max(0, previous - 1)), 1000);
            } catch {
                if (active) {
                    setIsCheckingConfig(false);
                    setClickhouseMetrics(null);
                    setIsFetchingHistory(false);
                }
            }
        }

        void initialize();
        return () => {
            active = false;
            if (intervalId) clearInterval(intervalId);
            if (countdownId) clearInterval(countdownId);
        };
    }, [namespace, podName, enabled]);

    return { clickhouseMetrics, refreshCountdown, scrapeIntervalSec, isFetchingHistory, isCheckingConfig };
}
