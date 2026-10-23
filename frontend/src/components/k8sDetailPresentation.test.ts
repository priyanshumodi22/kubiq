import { describe, expect, it } from 'vitest';
import { historyIntervalLabel, historyLoadingText, imageSpecs, metricChartData } from './k8sDetailPresentation';

describe('Kubernetes detail presentation compatibility', () => {
    it('preserves registry, tag and digest parsing', () => {
        expect(imageSpecs('nginx')).toEqual({ registry: 'docker.io (DockerHub)', repository: 'nginx', tag: 'latest', digest: '' });
        expect(imageSpecs('registry.example.test:5000/team/api:v2', 'docker-pullable://api@sha256:' + 'a'.repeat(64))).toEqual({ registry: 'registry.example.test:5000', repository: 'team/api', tag: 'v2', digest: 'sha256:' + 'a'.repeat(64) });
        expect(imageSpecs('team/api:v1', 'sha256:short').digest).toBe('');
    });
    it('preserves numeric conversion and missing timestamp spacing', () => {
        const data = metricChartData(['12.9', 'bad', 3], [0, '21.5'], [], 100000);
        expect(data.map(row => [row.cpu, row.memory, row.relativeStr])).toEqual([[12, 0, '-1m'], [0, 21, '-30s'], [3, 0, 'Now']]);
        expect(metricChartData([1], [2], [7200000], 1)[0].relativeStr).toBe('Now');
    });
    it('prioritizes configuration status and keeps exact interval labels', () => {
        expect(historyLoadingText(true, true).title).toBe('Loading telemetry configuration...');
        expect(historyLoadingText(false, true).title).toBe('Loading historical metrics...');
        expect(historyLoadingText(false, false).title).toBe('Synchronizing live APM stream...');
        expect([30, 60, 90, 120].map(historyIntervalLabel)).toEqual(['30s', '1m', '90s', '2m']);
    });
});
