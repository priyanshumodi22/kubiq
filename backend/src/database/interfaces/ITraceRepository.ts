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

export interface IServiceDependency {
  source: string;
  target: string;
  callCount: number;
  errorCount: number;
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
   * Identifies dependent service calls and their frequencies to build a topology map
   */
  getServiceDependencies(timeRangeMs: number): Promise<IServiceDependency[]>;

  /**
   * Retrieves the most recent trace ID for a given service to enable 1-click drilldowns
   */
  getRecentTraceIdForService(serviceName: string): Promise<string | null>;

  /**
   * Retrieves the most recent trace ID for a given edge (source to target service dependency)
   */
  getRecentTraceIdForEdge(source: string, target: string): Promise<string | null>;
}
