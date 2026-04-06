import { z } from "zod";
import { Timestamp } from "@use-tusk/drift-schemas/google/protobuf/timestamp";
import { Value } from "@use-tusk/drift-schemas/google/protobuf/struct";
import {
  AggregateSpansRequest as SharedAggregateSpansRequest,
  CastType,
  DecodeStrategy,
  GetSchemaRequest as SharedGetSchemaRequest,
  GetSpansByIdsRequest as SharedGetSpansByIdsRequest,
  GetTraceSpansRequest as SharedGetTraceSpansRequest,
  ListDistinctValuesRequest as SharedListDistinctValuesRequest,
  QuerySpansRequest as SharedQuerySpansRequest,
  TimeBucket,
  type FieldAccess as SharedFieldAccess,
  type FieldPredicate as SharedFieldPredicate,
  type WhereClause as SharedWhereClause,
} from "@use-tusk/drift-schemas/query/span_query";
import {
  aggregateGroupFieldCodec,
  aggregateMetricCodec,
  castTypeCodec,
  decodeStrategyCodec,
  selectableSpanFieldCodec,
  sortDirectionCodec,
  spanSortFieldCodec,
  timeBucketCodec,
  type EnumCodec,
} from "@use-tusk/drift-schemas/query/span_query_helpers";

// ============================================
// Configuration
// ============================================

export interface TuskDriftConfig {
  /** Base URL for the Tusk Drift API (e.g., https://api.usetusk.ai) */
  apiBaseUrl: string;
  /** API key or JWT token for authentication */
  apiToken: string;
  /** Optional default observable service ID (can be overridden per request) */
  observableServiceId?: string;
}

type QueryValue = string | number | boolean | null;

function enumNameSchema<TName extends string, TValue extends number>(codec: EnumCodec<TName, TValue>) {
  return z.custom<TName>((value): value is TName => codec.isName(value), {
    message: `Expected one of: ${codec.names.join(", ")}`,
  });
}

const queryValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const timestampRangeSchema = z
  .object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  })
  .strict();

export const fieldAccessSchema = z
  .object({
    castAs: enumNameSchema(castTypeCodec).optional(),
    decode: enumNameSchema(decodeStrategyCodec).optional(),
    thenPath: z.string().regex(/^\$/, "JSONPath must start with $").optional(),
  })
  .strict();

type FieldAccessInput = z.infer<typeof fieldAccessSchema>;

export const fieldPredicateSchema = z
  .object({
    eq: queryValueSchema.optional(),
    neq: queryValueSchema.optional(),
    inValues: z.array(queryValueSchema).optional(),
    notInValues: z.array(queryValueSchema).optional(),
    gt: queryValueSchema.optional(),
    gte: queryValueSchema.optional(),
    lt: queryValueSchema.optional(),
    lte: queryValueSchema.optional(),
    contains: z.string().optional(),
    startsWith: z.string().optional(),
    endsWith: z.string().optional(),
    isNull: z.boolean().optional(),
    betweenTimestamps: timestampRangeSchema.optional(),
    access: fieldAccessSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.eq !== undefined ||
      value.neq !== undefined ||
      value.inValues !== undefined ||
      value.notInValues !== undefined ||
      value.gt !== undefined ||
      value.gte !== undefined ||
      value.lt !== undefined ||
      value.lte !== undefined ||
      value.contains !== undefined ||
      value.startsWith !== undefined ||
      value.endsWith !== undefined ||
      value.isNull !== undefined ||
      value.betweenTimestamps !== undefined,
    {
      message: "At least one predicate operator is required",
    }
  );

type FieldPredicateInput = z.infer<typeof fieldPredicateSchema>;

type SpanWhereClauseArgs = {
  fields: Record<string, FieldPredicateInput>;
  and: SpanWhereClauseArgs[];
  or: SpanWhereClauseArgs[];
  not?: SpanWhereClauseArgs;
};

type SpanWhereClauseRawInput = {
  fields?: Record<string, FieldPredicateInput>;
  and?: SpanWhereClauseRawInput[];
  or?: SpanWhereClauseRawInput[];
  not?: SpanWhereClauseRawInput;
};

export const spanWhereClauseSchema: z.ZodType<
  SpanWhereClauseArgs,
  z.ZodTypeDef,
  SpanWhereClauseRawInput
> = z.lazy(() =>
  z
    .object({
      fields: z.record(z.string(), fieldPredicateSchema).default({}),
      and: z.array(spanWhereClauseSchema).default([]),
      or: z.array(spanWhereClauseSchema).default([]),
      not: spanWhereClauseSchema.optional(),
    })
    .strict()
    .refine(
      (value) =>
        Object.keys(value.fields).length > 0 ||
        value.and.length > 0 ||
        value.or.length > 0 ||
        value.not !== undefined,
      {
        message: "Where clause cannot be empty",
      }
    )
);

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
  where: spanWhereClauseSchema.optional().describe("Recursive span filter clause"),
  orderBy: z
    .array(
      z.object({
        field: enumNameSchema(spanSortFieldCodec),
        direction: enumNameSchema(sortDirectionCodec),
      })
    )
    .optional()
    .describe("Ordering"),
  limit: z.number().min(1).max(100).default(20).describe("Max results to return"),
  offset: z.number().min(0).default(0).describe("Pagination offset"),
  includePayloads: z.boolean().default(false).describe("Include full inputValue/outputValue (verbose)"),
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
  limit: z.number().min(1).max(100).default(50).describe("Max distinct values to return"),
});

export const aggregateSpansInputSchema = z.object({
  observableServiceId: z.string().optional().describe("Service ID to query (required if multiple services available)"),
  where: spanWhereClauseSchema.optional().describe("Filter conditions"),
  groupBy: z
    .array(enumNameSchema(aggregateGroupFieldCodec))
    .optional()
    .describe("Fields to group by"),
  metrics: z
    .array(enumNameSchema(aggregateMetricCodec))
    .min(1)
    .describe("Metrics to calculate"),
  timeBucket: enumNameSchema(timeBucketCodec).optional().describe("Time bucket for time-series data"),
  orderBy: z
    .object({
      metric: enumNameSchema(aggregateMetricCodec),
      direction: enumNameSchema(sortDirectionCodec),
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
  fields: z.array(enumNameSchema(selectableSpanFieldCodec)).optional().describe("Specific fields to return"),
  includePayloads: z.boolean().default(true).describe("Include inputValue/outputValue"),
  maxPayloadLength: z.number().min(0).default(500).describe("Truncate payload strings"),
});

type QuerySpansArgs = z.infer<typeof querySpansInputSchema>;
type GetSchemaArgs = z.infer<typeof getSchemaInputSchema>;
type ListDistinctValuesArgs = z.infer<typeof listDistinctValuesInputSchema>;
type AggregateSpansArgs = z.infer<typeof aggregateSpansInputSchema>;
type GetTraceArgs = z.infer<typeof getTraceInputSchema>;
type GetSpansByIdsArgs = z.infer<typeof getSpansByIdsInputSchema>;

export type QuerySpansInput = SharedQuerySpansRequest;
export type GetSchemaInput = SharedGetSchemaRequest;
export type ListDistinctValuesInput = SharedListDistinctValuesRequest;
export type AggregateSpansInput = SharedAggregateSpansRequest;
export type GetTraceInput = SharedGetTraceSpansRequest;
export type GetSpansByIdsInput = SharedGetSpansByIdsRequest;

function toProtoValue(value: QueryValue) {
  return Value.fromJson(value);
}

function toProtoFieldAccess(access?: FieldAccessInput): SharedFieldAccess | undefined {
  if (!access) {
    return undefined;
  }

  return {
    castAs: access.castAs ? castTypeCodec.byName[access.castAs] : CastType.UNSPECIFIED,
    decode: access.decode ? decodeStrategyCodec.byName[access.decode] : DecodeStrategy.UNSPECIFIED,
    thenPath: access.thenPath,
  };
}

function toProtoFieldPredicate(predicate: FieldPredicateInput): SharedFieldPredicate {
  return {
    eq: predicate.eq !== undefined ? toProtoValue(predicate.eq) : undefined,
    neq: predicate.neq !== undefined ? toProtoValue(predicate.neq) : undefined,
    inValues: predicate.inValues?.map(toProtoValue) ?? [],
    notInValues: predicate.notInValues?.map(toProtoValue) ?? [],
    gt: predicate.gt !== undefined ? toProtoValue(predicate.gt) : undefined,
    gte: predicate.gte !== undefined ? toProtoValue(predicate.gte) : undefined,
    lt: predicate.lt !== undefined ? toProtoValue(predicate.lt) : undefined,
    lte: predicate.lte !== undefined ? toProtoValue(predicate.lte) : undefined,
    contains: predicate.contains,
    startsWith: predicate.startsWith,
    endsWith: predicate.endsWith,
    isNull: predicate.isNull,
    betweenTimestamps: predicate.betweenTimestamps
      ? {
          start: Timestamp.fromDate(predicate.betweenTimestamps.start),
          end: Timestamp.fromDate(predicate.betweenTimestamps.end),
        }
      : undefined,
    access: toProtoFieldAccess(predicate.access),
  };
}

function toProtoWhereClause(where: SpanWhereClauseArgs): SharedWhereClause {
  return {
    fields: Object.fromEntries(
      Object.entries(where.fields).map(([field, predicate]) => [field, toProtoFieldPredicate(predicate)])
    ),
    and: where.and.map(toProtoWhereClause),
    or: where.or.map(toProtoWhereClause),
    not: where.not ? toProtoWhereClause(where.not) : undefined,
  };
}

export function parseQuerySpansInput(args: Record<string, unknown>): QuerySpansInput {
  const input: QuerySpansArgs = querySpansInputSchema.parse(args);
  return SharedQuerySpansRequest.create({
    observableServiceId: input.observableServiceId ?? "",
    where: input.where ? toProtoWhereClause(input.where) : undefined,
    orderBy: (input.orderBy ?? []).map((orderBy) => ({
      field: spanSortFieldCodec.byName[orderBy.field],
      direction: sortDirectionCodec.byName[orderBy.direction],
    })),
    limit: input.limit,
    offset: input.offset,
    includePayloads: input.includePayloads,
    maxPayloadLength: input.maxPayloadLength,
  });
}

export function parseGetSchemaInput(args: Record<string, unknown>): GetSchemaInput {
  const input: GetSchemaArgs = getSchemaInputSchema.parse(args);
  return SharedGetSchemaRequest.create({
    observableServiceId: input.observableServiceId ?? "",
    packageName: input.packageName,
    instrumentationName: input.instrumentationName,
    name: input.name,
    showExample: input.showExample,
    maxPayloadLength: input.maxPayloadLength,
  });
}

export function parseListDistinctValuesInput(args: Record<string, unknown>): ListDistinctValuesInput {
  const input: ListDistinctValuesArgs = listDistinctValuesInputSchema.parse(args);
  return SharedListDistinctValuesRequest.create({
    observableServiceId: input.observableServiceId ?? "",
    field: input.field,
    where: input.where ? toProtoWhereClause(input.where) : undefined,
    limit: input.limit,
  });
}

export function parseAggregateSpansInput(args: Record<string, unknown>): AggregateSpansInput {
  const input: AggregateSpansArgs = aggregateSpansInputSchema.parse(args);
  return SharedAggregateSpansRequest.create({
    observableServiceId: input.observableServiceId ?? "",
    where: input.where ? toProtoWhereClause(input.where) : undefined,
    groupBy: (input.groupBy ?? []).map((field) => aggregateGroupFieldCodec.byName[field]),
    metrics: input.metrics.map((metric) => aggregateMetricCodec.byName[metric]),
    timeBucket: input.timeBucket ? timeBucketCodec.byName[input.timeBucket] : TimeBucket.UNSPECIFIED,
    orderBy: input.orderBy
      ? {
          metric: aggregateMetricCodec.byName[input.orderBy.metric],
          direction: sortDirectionCodec.byName[input.orderBy.direction],
        }
      : undefined,
    limit: input.limit,
  });
}

export function parseGetTraceInput(args: Record<string, unknown>): GetTraceInput {
  const input: GetTraceArgs = getTraceInputSchema.parse(args);
  return SharedGetTraceSpansRequest.create({
    observableServiceId: input.observableServiceId ?? "",
    traceId: input.traceId,
    includePayloads: input.includePayloads,
    maxPayloadLength: input.maxPayloadLength,
  });
}

export function parseGetSpansByIdsInput(args: Record<string, unknown>): GetSpansByIdsInput {
  const input: GetSpansByIdsArgs = getSpansByIdsInputSchema.parse(args);
  return SharedGetSpansByIdsRequest.create({
    observableServiceId: input.observableServiceId ?? "",
    ids: input.ids,
    fields: (input.fields ?? []).map((field) => selectableSpanFieldCodec.byName[field]),
    includePayloads: input.includePayloads,
    maxPayloadLength: input.maxPayloadLength,
  });
}

