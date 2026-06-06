import { asStructuredError } from "./errors.js";

export function ok<T extends Record<string, unknown>>(structuredContent: T, text = "OK") {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent
  };
}

export function fail(error: unknown) {
  const structuredContent = asStructuredError(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `${structuredContent.code}: ${structuredContent.error}` }],
    structuredContent
  };
}

export function paginate<T>(items: T[], page = 1, pageSize = 25) {
  const safePage = Math.max(1, Math.trunc(page || 1));
  const safeSize = Math.max(1, Math.min(100, Math.trunc(pageSize || 25)));
  const offset = (safePage - 1) * safeSize;
  return {
    items: items.slice(offset, offset + safeSize),
    page: safePage,
    pageSize: safeSize,
    total: items.length,
    hasMore: offset + safeSize < items.length
  };
}
