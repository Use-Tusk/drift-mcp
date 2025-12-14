import { z } from "zod";

// ============================================
// Configuration
// ============================================

export interface TuskDriftConfig {
  /** Base URL for the Tusk Drift API (e.g., https://api.usetusk.ai) */
  apiBaseUrl: string;
  /** API key for authentication (sent via x-api-key header) */
  apiToken: string;
  /** Optional default observable service ID (can be overridden per request) */
  observableServiceId?: string;
}

// ============================================
// Shared Filter Schemas
// ============================================

export const stringFilterSchema = z.object({
  eq: z.string().optional(),
  neq: z.string().optional(),
  in: z.array(z.string()).optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
});

export const numberFilterSchema = z.object({
  eq: z.number().optional(),
  neq: z.number().optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
});

export const booleanFilterSchema = z.object({
  eq: z.boolean(),
});

// ============================================
// JSONB Filter Schema
// ============================================

export const jsonbFilterSchema = z.object({
  column: z.enum(["inputValue", "outputValue", "metadata", "status"]),
  jsonPath: z.string().regex(/^\$/, "JSONPath must start with $"),
  eq: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  neq: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  gt: z.number().optional(),
  gte: z.number().optional(),
  lt: z.number().optional(),
  lte: z.number().optional(),
  contains: z.string().optional(),
  startsWith: z.string().optional(),
  endsWith: z.string().optional(),
  isNull: z.boolean().optional(),
  in: z.array(z.union([z.string(), z.number()])).optional(),
  castAs: z.enum(["text", "int", "float", "boolean"]).optional(),
  decodeBase64: z.boolean().optional(),
  thenPath: z.string().regex(/^\$/, "JSONPath must start with $").optional(),
});

export type JsonbFilter = z.infer<typeof jsonbFilterSchema>;

// ============================================
// Span Where Clause
// ============================================

export const spanWhereClauseSchema: z.ZodType<SpanWhereClause> = z.lazy(() =>
  z
    .object({
      // Field filters
      name: stringFilterSchema.optional(),
      packageName: stringFilterSchema.optional(),
      instrumentationName: stringFilterSchema.optional(),
      environment: stringFilterSchema.optional(),
      traceId: stringFilterSchema.optional(),
      spanId: stringFilterSchema.optional(),
      duration: numberFilterSchema.optional(),
      isRootSpan: booleanFilterSchema.optional(),
      // Logical operators
      AND: z.array(spanWhereClauseSchema).optional(),
      OR: z.array(spanWhereClauseSchema).optional(),
    })
    .partial()
);

export interface SpanWhereClause {
  name?: z.infer<typeof stringFilterSchema>;
  packageName?: z.infer<typeof stringFilterSchema>;
  instrumentationName?: z.infer<typeof stringFilterSchema>;
  environment?: z.infer<typeof stringFilterSchema>;
  traceId?: z.infer<typeof stringFilterSchema>;
  spanId?: z.infer<typeof stringFilterSchema>;
  duration?: z.infer<typeof numberFilterSchema>;
  isRootSpan?: z.infer<typeof booleanFilterSchema>;
  AND?: SpanWhereClause[];
  OR?: SpanWhereClause[];
}

// ============================================
// API Response Types
// ============================================

export interface SpanRecording {
  id: string;
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  status: { code: number; message?: string };
  timestamp: string;
  duration: number;
  isRootSpan: boolean;
  packageName: string;
  instrumentationName: string;
  submoduleName?: string;
  environment?: string;
  inputValue?: unknown;
  outputValue?: unknown;
  inputSchema?: unknown;
  outputSchema?: unknown;
  metadata?: unknown;
}

export interface TraceSpan extends SpanRecording {
  children?: TraceSpan[];
}

export interface SchemaResult {
  inputSchema?: unknown;
  outputSchema?: unknown;
  exampleSpanRecording?: Partial<SpanRecording>;
  commonJsonbFields: {
    inputValue: string[];
    outputValue: string[];
  };
  description?: string;
}

export interface DistinctValue {
  value: unknown;
  count: number;
}

export interface AggregationRow {
  groupValues: Record<string, unknown>;
  timeBucket?: string;
  count: number;
  errorCount?: number;
  errorRate?: number;
  avgDuration?: number;
  minDuration?: number;
  maxDuration?: number;
  p50Duration?: number;
  p95Duration?: number;
  p99Duration?: number;
}

// ============================================
// Tool Input Schemas
// ============================================

export const querySpansInputSchema = z.object({
  observableServiceId: z.string().optional().describe("Service ID to query (required if multiple services available)"),
  where: spanWhereClauseSchema.optional().describe("Filter conditions for spans"),
  jsonbFilters: z.array(jsonbFilterSchema).optional().describe("JSONB path filters for inputValue/outputValue"),
  orderBy: z
    .array(
      z.object({
        field: z.enum(["timestamp", "duration", "name"]),
        direction: z.enum(["ASC", "DESC"]),
      })
    )
    .optional()
    .describe("Ordering"),
  limit: z.number().min(1).max(100).default(20).describe("Max results to return"),
  offset: z.number().min(0).default(0).describe("Pagination offset"),
  includeInputOutput: z.boolean().default(false).describe("Include full inputValue/outputValue (verbose)"),
  maxPayloadLength: z.number().min(0).default(500).describe("Truncate payload strings to this length"),
});

export const getSchemaInputSchema = z.object({
  observableServiceId: z.string().optional().describe("Service ID to query (required if multiple services available)"),
  packageName: z.string().optional().describe("Package name (e.g., 'http', 'pg', 'fetch')"),
  instrumentationName: z.string().optional().describe("Instrumentation name"),
  name: z.string().optional().describe("Span name to filter by"),
  showExample: z.boolean().default(true).describe("Include an example span"),
  maxPayloadLength: z.number().min(0).default(500).describe("Truncate example payload strings"),
});

export const listDistinctValuesInputSchema = z.object({
  observableServiceId: z.string().optional().describe("Service ID to query (required if multiple services available)"),
  field: z.string().describe("Field to get distinct values for (e.g., 'name', 'packageName', 'outputValue.statusCode')"),
  where: spanWhereClauseSchema.optional().describe("Filter conditions"),
  jsonbFilters: z.array(jsonbFilterSchema).optional().describe("JSONB path filters"),
  limit: z.number().min(1).max(100).default(50).describe("Max distinct values to return"),
});

export const aggregateSpansInputSchema = z.object({
  observableServiceId: z.string().optional().describe("Service ID to query (required if multiple services available)"),
  where: spanWhereClauseSchema.optional().describe("Filter conditions"),
  groupBy: z
    .array(z.enum(["name", "packageName", "instrumentationName", "environment", "statusCode"]))
    .optional()
    .describe("Fields to group by"),
  metrics: z
    .array(
      z.enum([
        "count",
        "errorCount",
        "errorRate",
        "avgDuration",
        "minDuration",
        "maxDuration",
        "p50Duration",
        "p95Duration",
        "p99Duration",
      ])
    )
    .min(1)
    .describe("Metrics to calculate"),
  timeBucket: z.enum(["hour", "day", "week"]).optional().describe("Time bucket for time-series data"),
  orderBy: z
    .object({
      metric: z.string(),
      direction: z.enum(["ASC", "DESC"]),
    })
    .optional()
    .describe("Order by metric"),
  limit: z.number().min(1).max(100).default(20).describe("Max results"),
});

export const getTraceInputSchema = z.object({
  observableServiceId: z.string().optional().describe("Service ID to query (required if multiple services available)"),
  traceId: z.string().describe("Trace ID to fetch"),
  includePayloads: z.boolean().default(false).describe("Include inputValue/outputValue"),
  maxPayloadLength: z.number().min(0).default(500).describe("Truncate payload strings"),
});

export const getSpansByIdsInputSchema = z.object({
  observableServiceId: z.string().optional().describe("Service ID to query (required if multiple services available)"),
  ids: z.array(z.string()).min(1).max(20).describe("Span recording IDs to fetch"),
  includePayloads: z.boolean().default(true).describe("Include inputValue/outputValue"),
  maxPayloadLength: z.number().min(0).default(500).describe("Truncate payload strings"),
});

// Type exports
export type QuerySpansInput = z.infer<typeof querySpansInputSchema>;
export type GetSchemaInput = z.infer<typeof getSchemaInputSchema>;
export type ListDistinctValuesInput = z.infer<typeof listDistinctValuesInputSchema>;
export type AggregateSpansInput = z.infer<typeof aggregateSpansInputSchema>;
export type GetTraceInput = z.infer<typeof getTraceInputSchema>;
export type GetSpansByIdsInput = z.infer<typeof getSpansByIdsInputSchema>;

