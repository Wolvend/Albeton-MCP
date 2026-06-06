import crypto from "node:crypto";
import { AbletonMcpError } from "./errors.js";
import { fail, ok } from "./response.js";

export type ToolAnnotations = {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};

export type RuntimeTool = {
  name: string;
  description: string;
  annotations: ToolAnnotations;
  handler: (args: any) => Promise<Record<string, unknown>>;
};

type ToolMetric = {
  calls: number;
  failures: number;
  cacheHits: number;
  lastDurationMs: number;
  maxDurationMs: number;
  lastCalledAt: string | null;
};

type CacheEntry = {
  expiresAt: number;
  value: Record<string, unknown>;
};

const metrics = new Map<string, ToolMetric>();
const readCache = new Map<string, CacheEntry>();
const callBuckets = new Map<string, number[]>();
const MAX_RESPONSE_BYTES = 256_000;
const MAX_ARGUMENT_BYTES = 64_000;
const CACHE_TTL_MS = 5_000;
const RATE_WINDOW_MS = 10_000;
const DEFAULT_RATE_LIMIT = 80;
const WRITE_RATE_LIMIT = 20;

function metricFor(name: string): ToolMetric {
  let metric = metrics.get(name);
  if (!metric) {
    metric = { calls: 0, failures: 0, cacheHits: 0, lastDurationMs: 0, maxDurationMs: 0, lastCalledAt: null };
    metrics.set(name, metric);
  }
  return metric;
}

function cacheKey(tool: RuntimeTool, args: unknown) {
  return crypto.createHash("sha256").update(`${tool.name}:${JSON.stringify(args ?? {})}`).digest("hex");
}

function isCacheable(tool: RuntimeTool) {
  return tool.annotations.readOnlyHint && tool.annotations.idempotentHint && !tool.annotations.openWorldHint;
}

function assertRateLimit(tool: RuntimeTool) {
  const now = Date.now();
  const limit = tool.annotations.readOnlyHint ? DEFAULT_RATE_LIMIT : WRITE_RATE_LIMIT;
  const bucket = (callBuckets.get(tool.name) ?? []).filter((timestamp) => now - timestamp <= RATE_WINDOW_MS);
  if (bucket.length >= limit) {
    throw new AbletonMcpError(
      `Rate limit exceeded for ${tool.name}.`,
      "RATE_LIMITED",
      [`Retry after ${Math.ceil(RATE_WINDOW_MS / 1000)} seconds.`, "Use pagination or narrower filters for repeated reads."]
    );
  }
  bucket.push(now);
  callBuckets.set(tool.name, bucket);
}

function enforceResponseLimit(tool: RuntimeTool, result: Record<string, unknown>) {
  const bytes = Buffer.byteLength(JSON.stringify(result));
  if (bytes > MAX_RESPONSE_BYTES) {
    throw new AbletonMcpError(
      `${tool.name} produced ${bytes} bytes, exceeding the ${MAX_RESPONSE_BYTES} byte MCP response limit.`,
      "RESPONSE_TOO_LARGE",
      ["Use page/pageSize, a narrower query, or a more specific path."]
    );
  }
}

function enforceArgumentLimit(tool: RuntimeTool, args: unknown) {
  const bytes = Buffer.byteLength(JSON.stringify(args ?? {}));
  if (bytes > MAX_ARGUMENT_BYTES) {
    throw new AbletonMcpError(
      `${tool.name} received ${bytes} bytes of arguments, exceeding the ${MAX_ARGUMENT_BYTES} byte MCP argument limit.`,
      "ARGUMENTS_TOO_LARGE",
      ["Use smaller payloads, narrower filters, or staged files under allowed roots."]
    );
  }
}

export async function runTool(tool: RuntimeTool, args: any) {
  const metric = metricFor(tool.name);
  const started = performance.now();
  metric.calls += 1;
  metric.lastCalledAt = new Date().toISOString();
  try {
    assertRateLimit(tool);
    enforceArgumentLimit(tool, args);
    const key = cacheKey(tool, args);
    if (isCacheable(tool)) {
      const cached = readCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        metric.cacheHits += 1;
        return ok({ ...cached.value, runtime: { cached: true, tool: tool.name } }, tool.description);
      }
    }
    const value = await tool.handler(args);
    enforceResponseLimit(tool, value);
    if (isCacheable(tool)) {
      readCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    }
    return ok({ ...value, runtime: { cached: false, tool: tool.name } }, tool.description);
  } catch (error) {
    metric.failures += 1;
    return fail(error);
  } finally {
    const duration = Math.round(performance.now() - started);
    metric.lastDurationMs = duration;
    metric.maxDurationMs = Math.max(metric.maxDurationMs, duration);
  }
}

export function getRuntimeReport() {
  return {
    middleware: [
      "error_handling",
      "timing_metrics",
      "per_tool_rate_limit",
      "read_response_cache",
      "response_size_limit"
    ],
    limits: {
      maxResponseBytes: MAX_RESPONSE_BYTES,
      maxArgumentBytes: MAX_ARGUMENT_BYTES,
      cacheTtlMs: CACHE_TTL_MS,
      rateWindowMs: RATE_WINDOW_MS,
      defaultReadCallsPerWindow: DEFAULT_RATE_LIMIT,
      writeCallsPerWindow: WRITE_RATE_LIMIT
    },
    tools: Object.fromEntries([...metrics.entries()].sort(([left], [right]) => left.localeCompare(right)))
  };
}
