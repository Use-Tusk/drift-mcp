import type {
  TuskDriftConfig,
  SchemaResult,
  QuerySpansInput,
  GetSchemaInput,
  ListDistinctValuesInput,
  AggregateSpansInput,
  GetTraceInput,
  GetSpansByIdsInput,
} from "./types.js";
import type { ServiceDiscoveryContext } from "./serviceDiscovery.js";
import type {
  DriftDataProvider,
  QuerySpansResult,
  ListDistinctValuesResult,
  AggregateSpansResult,
  GetTraceResult,
  GetSpansByIdsResult,
} from "./provider.js";
import {
  AggregateSpansRequest,
  GetSchemaRequest,
  GetSpansByIdsRequest,
  GetTraceSpansRequest,
  ListDistinctValuesRequest,
  QuerySpansRequest,
} from "@use-tusk/drift-schemas/query/span_query";

const PROTO_JSON_OPTIONS = { enumAsInteger: true } as const;

type QuerySpansApiResponse = {
  spans: QuerySpansResult["spans"];
  hasMore: boolean;
  total?: number;
  totalCount?: number;
};

/**
 * HTTP client for communicating with the Tusk Drift API.
 * Implements DriftDataProvider for use with the MCP server.
 * Supports multi-service queries via ServiceDiscoveryContext.
 */
export class TuskDriftApiClient implements DriftDataProvider {
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
        "x-api-key": this.apiToken,
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
  async querySpans(input: QuerySpansInput): Promise<QuerySpansResult> {
    const result = await this.request<QuerySpansApiResponse>(
      "/spans",
      QuerySpansRequest.toJson(
        QuerySpansRequest.create({
          ...input,
          observableServiceId: this.resolveServiceId(input.observableServiceId || undefined),
        }),
        PROTO_JSON_OPTIONS
      )
    );

    const total = result.total ?? result.totalCount;
    if (total === undefined) {
      throw new Error("API response for /api/drift/query/spans is missing total/totalCount");
    }

    return {
      spans: result.spans,
      total,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get schema information for a specific instrumentation
   */
  async getSchema(input: GetSchemaInput): Promise<SchemaResult> {
    return this.request(
      "/schema",
      GetSchemaRequest.toJson(
        GetSchemaRequest.create({
          ...input,
          observableServiceId: this.resolveServiceId(input.observableServiceId || undefined),
        }),
        PROTO_JSON_OPTIONS
      )
    );
  }

  /**
   * Get span recordings by IDs
   */
  async getSpansByIds(input: GetSpansByIdsInput): Promise<GetSpansByIdsResult> {
    return this.request(
      "/spans-by-id",
      GetSpansByIdsRequest.toJson(
        GetSpansByIdsRequest.create({
          ...input,
          observableServiceId: this.resolveServiceId(input.observableServiceId || undefined),
        }),
        PROTO_JSON_OPTIONS
      )
    );
  }

  /**
   * List distinct values for a field
   */
  async listDistinctValues(input: ListDistinctValuesInput): Promise<ListDistinctValuesResult> {
    const result = await this.request<{ values: ListDistinctValuesResult["values"] }>(
      "/distinct",
      ListDistinctValuesRequest.toJson(
        ListDistinctValuesRequest.create({
          ...input,
          observableServiceId: this.resolveServiceId(input.observableServiceId || undefined),
        }),
        PROTO_JSON_OPTIONS
      )
    );
    return {
      values: result.values,
      field: input.field,
    };
  }

  /**
   * Aggregate spans with grouping and metrics
   */
  async aggregateSpans(input: AggregateSpansInput): Promise<AggregateSpansResult> {
    const result = await this.request<{ results: AggregateSpansResult["results"] }>(
      "/aggregate",
      AggregateSpansRequest.toJson(
        AggregateSpansRequest.create({
          ...input,
          observableServiceId: this.resolveServiceId(input.observableServiceId || undefined),
        }),
        PROTO_JSON_OPTIONS
      )
    );
    return { results: result.results };
  }

  /**
   * Get all spans in a trace as a tree
   */
  async getTrace(input: GetTraceInput): Promise<GetTraceResult> {
    return this.request(
      "/trace",
      GetTraceSpansRequest.toJson(
        GetTraceSpansRequest.create({
          ...input,
          observableServiceId: this.resolveServiceId(input.observableServiceId || undefined),
        }),
        PROTO_JSON_OPTIONS
      )
    );
  }
}

