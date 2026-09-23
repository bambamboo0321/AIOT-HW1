/**
 * Safe Server-only HTTP Client Foundation
 *
 * Designed for server-side upstream API fetching.
 * Features:
 * - Native fetch with AbortController timeout
 * - Injectable fetch for deterministic unit testing
 * - Classified error throwing (TimeoutError, NetworkError, UpstreamError, ParseError)
 * - Raw upstream bodies, query strings, headers, and credentials are NEVER exposed in errors
 * - Default no auto-retry to prevent amplified traffic
 * - Strict TLS verification maintained
 */

import { TimeoutError, NetworkError, UpstreamError, ParseError } from "./errors";

if (typeof window !== "undefined") {
  throw new Error("Security Error: http-client module cannot be imported in client-side code.");
}

export const DEFAULT_TIMEOUT_MS = 10000;

export interface SafeGetOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  fetchFn?: typeof fetch;
}

/**
 * Performs a safe GET request and parses the JSON response.
 *
 * @param url Full target URL
 * @param options Timeout, custom headers, and optional fetch implementation injection
 * @returns Parsed JSON body of type T
 */
export async function safeGetJson<T>(
  url: string,
  options: SafeGetOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchFn ?? fetch;

  const controller = new AbortController();
  let isTimeout = false;

  const timer = setTimeout(() => {
    isTimeout = true;
    controller.abort();
  }, timeoutMs);

  let response: Response;

  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: options.headers,
      signal: controller.signal,
    });
  } catch (err: unknown) {
    if (isTimeout || (err instanceof Error && err.name === "AbortError")) {
      throw new TimeoutError();
    }
    // Generic network/connectivity/DNS error
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // Strictly omit raw upstream body or sensitive headers from error
    throw new UpstreamError(response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ParseError();
  }
}
