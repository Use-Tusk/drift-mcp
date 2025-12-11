import type {
  TuskDriftConfig,
  SpanRecording,
  TraceSpan,
  SchemaResult,
  DistinctValue,
  AggregationRow,
  QuerySpansInput,
  GetSchemaInput,
  ListDistinctValuesInput,
  AggregateSpansInput,
  GetTraceInput,
  GetSpansByIdsInput,
} from "./types.js";
import type { ServiceDiscoveryContext } from "./serviceDiscovery.js";

/**
 * HTTP client for communicating with the Tusk Drift API.
 * Supports multi-service queries via ServiceDiscoveryContext.
 */
export class TuskDriftApiClient {
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private serviceContext?: ServiceDiscoveryContext;

  constructor(config: TuskDriftConfig) {
    this.baseUrl = config.apiBaseUrl.replace(/\/$/, "");
    this.apiToken = config.apiToken;
  }

  /**
   * Set the service discovery context for resolving service IDs.
   */
  setServiceContext(context: ServiceDiscoveryContext): void {
    this.serviceContext = context;
  }

  /**
   * Resolve the service ID to use for a request.
   * Uses the provided ID, or falls back to the service context.
   */
  private resolveServiceId(providedServiceId?: string): string {
    if (this.serviceContext) {
      return this.serviceContext.resolveServiceId(providedServiceId);
    }
    if (providedServiceId) {
      return providedServiceId;
    }
    throw new Error(
      "No service ID provided and no service context configured. " +
        "Set TUSK_DRIFT_SERVICE_ID or ensure a .tusk/config.yaml exists."
    );
  }

  private async request<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/drift/query${endpoint}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Query span recordings with filters
   */
  async querySpans(input: QuerySpansInput): Promise<{
    spans: SpanRecording[];
    total: number;
    hasMore: boolean;
  }> {
    const { observableServiceId, ...rest } = input;
    return this.request("/spans", {
      observableServiceId: this.resolveServiceId(observableServiceId),
      ...rest,
    });
  }

  /**
   * Get schema information for a specific instrumentation
   */
  async getSchema(input: GetSchemaInput): Promise<SchemaResult> {
    const { observableServiceId, ...rest } = input;
    return this.request("/schema", {
      observableServiceId: this.resolveServiceId(observableServiceId),
      ...rest,
    });
  }

  /**
   * Get span recordings by IDs
   */
  async getSpansByIds(input: GetSpansByIdsInput): Promise<{
    spans: SpanRecording[];
  }> {
    const { observableServiceId, ...rest } = input;
    return this.request("/spans-by-id", {
      observableServiceId: this.resolveServiceId(observableServiceId),
      ...rest,
    });
  }

  /**
   * List distinct values for a field
   */
  async listDistinctValues(input: ListDistinctValuesInput): Promise<{
    values: DistinctValue[];
    field: string;
  }> {
    const { observableServiceId, ...rest } = input;
    return this.request("/distinct", {
      observableServiceId: this.resolveServiceId(observableServiceId),
      ...rest,
    });
  }

  /**
   * Aggregate spans with grouping and metrics
   */
  async aggregateSpans(input: AggregateSpansInput): Promise<{
    results: AggregationRow[];
    query: unknown;
  }> {
    const { observableServiceId, ...rest } = input;
    return this.request("/aggregate", {
      observableServiceId: this.resolveServiceId(observableServiceId),
      ...rest,
    });
  }

  /**
   * Get all spans in a trace as a tree
   */
  async getTrace(input: GetTraceInput): Promise<{
    traceTree: TraceSpan | null;
    spanCount: number;
  }> {
    const { observableServiceId, ...rest } = input;
    return this.request("/trace", {
      observableServiceId: this.resolveServiceId(observableServiceId),
      ...rest,
    });
  }
}

