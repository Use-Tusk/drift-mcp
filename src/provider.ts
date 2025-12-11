/**
 * Provider interfaces for drift-mcp.
 *
 * DriftDataProvider abstracts data access, allowing the MCP server to work with:
 * - HTTP API client (for local/standalone usage)
 * - Direct service integration (for hosted backend usage)
 */

import type {
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

/**
 * Result types for the data provider methods.
 * Normalized to work with both API responses and direct service calls.
 */
export interface QuerySpansResult {
  spans: SpanRecording[];
  total: number;
  hasMore: boolean;
}

export interface ListDistinctValuesResult {
  values: DistinctValue[];
  field: string;
}

export interface AggregateSpansResult {
  results: AggregationRow[];
}

export interface GetTraceResult {
  traceTree: TraceSpan | null;
  spanCount: number;
}

export interface GetSpansByIdsResult {
  spans: SpanRecording[];
}

/**
 * Data provider interface for Tusk Drift queries.
 * This abstraction allows the MCP server to work with different backends:
 * - API client (for standalone/local usage via HTTP)
 * - Direct service (for backend integration)
 */
export interface DriftDataProvider {
  /**
   * Query span recordings with filters.
   */
  querySpans(input: QuerySpansInput): Promise<QuerySpansResult>;

  /**
   * Get schema information for a specific instrumentation.
   */
  getSchema(input: GetSchemaInput): Promise<SchemaResult>;

  /**
   * List distinct values for a field.
   */
  listDistinctValues(input: ListDistinctValuesInput): Promise<ListDistinctValuesResult>;

  /**
   * Aggregate spans with grouping and metrics.
   */
  aggregateSpans(input: AggregateSpansInput): Promise<AggregateSpansResult>;

  /**
   * Get all spans in a trace as a tree.
   */
  getTrace(input: GetTraceInput): Promise<GetTraceResult>;

  /**
   * Get span recordings by IDs.
   */
  getSpansByIds(input: GetSpansByIdsInput): Promise<GetSpansByIdsResult>;
}

/**
 * Optional access control interface.
 * Implement this if you need to check permissions before executing queries.
 */
export interface DriftAccessControl {
  /**
   * Check if the current user/client can access the given observable service.
   * @returns true if access is allowed, false otherwise
   */
  canAccessService(observableServiceId: string): Promise<boolean>;
}

/**
 * Configuration for creating an MCP server.
 */
export interface CreateMcpServerOptions {
  /**
   * The data provider for executing queries.
   */
  provider: DriftDataProvider;

  /**
   * Optional access control for checking permissions.
   */
  accessControl?: DriftAccessControl;

  /**
   * Optional server instructions to include.
   */
  instructions?: string;

  /**
   * Server name (default: "tusk-drift")
   */
  name?: string;

  /**
   * Server version (default: "1.0.0")
   */
  version?: string;
}
