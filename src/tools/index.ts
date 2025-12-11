import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { TuskDriftApiClient } from "../apiClient.js";
import { querySpansTool, handleQuerySpans } from "./querySpans.js";
import { getSchemaTool, handleGetSchema } from "./getSchema.js";
import { listDistinctValuesTool, handleListDistinctValues } from "./listDistinctValues.js";
import { aggregateSpansTool, handleAggregateSpans } from "./aggregateSpans.js";
import { getTraceTool, handleGetTrace } from "./getTrace.js";
import { getSpansByIdsTool, handleGetSpansByIds } from "./getSpansByIds.js";

export const tools: Tool[] = [
  querySpansTool,
  getSchemaTool,
  listDistinctValuesTool,
  aggregateSpansTool,
  getTraceTool,
  getSpansByIdsTool,
];

export type ToolHandler = (
  client: TuskDriftApiClient,
  args: Record<string, unknown>
) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

export const toolHandlers: Record<string, ToolHandler> = {
  query_spans: handleQuerySpans,
  get_schema: handleGetSchema,
  list_distinct_values: handleListDistinctValues,
  aggregate_spans: handleAggregateSpans,
  get_trace: handleGetTrace,
  get_spans_by_ids: handleGetSpansByIds,
};

