export interface ISpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string | null;
  serviceName: string;
  name: string;
  kind?: string;
  startTimeUnixNano: number;
  endTimeUnixNano: number;
  durationMs: number;
  statusCode?: number;
  attributes?: Record<string, any>;
}

export interface IServiceMetrics {
  serviceName: string;
  requestCount: number;
  errorCount: number;
  avgDurationMs: number;
  p95DurationMs: number;
}

export interface ITraceRepository {
  /**
   * Initializes the repository (e.g., connects to database, creates tables)
   */
  initialize(): Promise<void>;

  /**
   * Batch inserts OpenTelemetry spans into the database
   */
  insertSpans(spans: ISpan[]): Promise<void>;

  /**
   * Retrieves aggregated metrics for all monitored services
   */
  getServiceMetrics(timeRangeMs: number): Promise<IServiceMetrics[]>;

  /**
   * Retrieves all spans for a given trace ID to build a waterfall view
   */
  getTraceDetails(traceId: string): Promise<ISpan[]>;

  /**
   * Retrieves the most recent trace ID for a given service to enable 1-click drilldowns
   */
  getRecentTraceIdForService(serviceName: string): Promise<string | null>;
}
