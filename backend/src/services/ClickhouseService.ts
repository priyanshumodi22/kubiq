import { createClient, ClickHouseClient } from '@clickhouse/client';

class ClickhouseService {
  private client: ClickHouseClient | null = null;
  private configured = false;
  private database = 'default';

  constructor() {
    // We don't read process.env here to avoid race conditions with dotenv loading in server.ts
  }

  private ensureConfigured() {
    if (this.configured) return;
    
    const url = process.env.CLICKHOUSE_URL;
    const username = process.env.CLICKHOUSE_USER || 'default';
    const password = process.env.CLICKHOUSE_PASSWORD || '';
    this.database = process.env.CLICKHOUSE_DATABASE || 'default';

    if (url) {
      this.client = createClient({
        url,
        username,
        password
      });
      this.configured = true;
    }
  }

  isConfigured(): boolean {
    this.ensureConfigured();
    return this.configured;
  }

  getClient(): ClickHouseClient | null {
    this.ensureConfigured();
    return this.client;
  }

  getDatabase(): string {
    this.ensureConfigured();
    return this.database;
  }

  async initialize(): Promise<void> {
    this.ensureConfigured();
    if (!this.client) return;
    try {
      await this.client.command({
        query: `CREATE DATABASE IF NOT EXISTS ${this.database}`
      });

      await this.client.command({
        query: `
          CREATE TABLE IF NOT EXISTS ${this.database}.k8s_pod_metrics (
            cluster_context String,
            namespace String,
            pod_name String,
            cpu_m Float64,
            memory_mi Float64,
            timestamp DateTime
          ) ENGINE = MergeTree()
          ORDER BY (cluster_context, namespace, pod_name, timestamp)
        `
      });
      console.log('ClickhouseService: k8s_pod_metrics table verified.');
    } catch (err) {
      console.error('ClickhouseService: Error initializing table', err);
    }
  }

  async insertPodMetrics(metrics: Array<{
    cluster_context: string;
    namespace: string;
    pod_name: string;
    cpu_m: number;
    memory_mi: number;
    timestamp: Date;
  }>): Promise<void> {
    if (!this.client || metrics.length === 0) return;
    try {
      const values = metrics.map(m => {
        const ts = m.timestamp.toISOString().replace('T', ' ').substring(0, 19);
        return {
          cluster_context: m.cluster_context,
          namespace: m.namespace,
          pod_name: m.pod_name,
          cpu_m: m.cpu_m,
          memory_mi: m.memory_mi,
          timestamp: ts
        };
      });

      await this.client.insert({
        table: `${this.database}.k8s_pod_metrics`,
        values,
        format: 'JSONEachRow'
      });
    } catch (err) {
      console.error('ClickhouseService: Error inserting metrics', err);
    }
  }

  async getPodMetricsHistory(clusterContext: string, namespace: string, podName: string, since: Date): Promise<any[]> {
    if (!this.client) return [];
    try {
      const ts = since.toISOString().replace('T', ' ').substring(0, 19);
      const resultSet = await this.client.query({
        query: `
          SELECT cpu_m, memory_mi, toUnixTimestamp(timestamp) * 1000 as timestamp_ms
          FROM ${this.database}.k8s_pod_metrics
          WHERE cluster_context = {clusterContext: String}
            AND namespace = {namespace: String}
            AND pod_name = {podName: String}
            AND timestamp >= {since: DateTime}
          ORDER BY timestamp ASC
        `,
        query_params: {
          clusterContext,
          namespace,
          podName,
          since: ts
        },
        format: 'JSONEachRow'
      });
      return await resultSet.json();
    } catch (err) {
      console.error('ClickhouseService: Error querying metrics', err);
      return [];
    }
  }
}

export const clickhouseService = new ClickhouseService();
