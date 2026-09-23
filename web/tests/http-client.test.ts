import { describe, it, expect, vi } from "vitest";
import { safeGetJson } from "@/lib/server/http-client";
import {
  TimeoutError,
  NetworkError,
  UpstreamError,
  ParseError,
} from "@/lib/server/errors";

describe("Safe Server HTTP Client", () => {
  it("successfully retrieves and parses JSON with injected fetch", async () => {
    const mockData = { temperature: 25.5, station: "Taipei" };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    } as unknown as Response);

    const result = await safeGetJson<typeof mockData>(
      "https://example.com/api/test",
      { fetchFn: mockFetch }
    );

    expect(result).toEqual(mockData);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/api/test",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("throws TimeoutError when request exceeds timeout duration", async () => {
    // Simulate a fetch that aborts or hangs beyond timeout
    const mockFetch = vi.fn().mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => {
          const abortError = new Error("This operation was aborted");
          abortError.name = "AbortError";
          reject(abortError);
        });
      });
    });

    await expect(
      safeGetJson("https://example.com/slow", {
        timeoutMs: 50,
        fetchFn: mockFetch,
      })
    ).rejects.toThrow(TimeoutError);

    try {
      await safeGetJson("https://example.com/slow", {
        timeoutMs: 20,
        fetchFn: mockFetch,
      });
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(TimeoutError);
      const timeoutErr = err as TimeoutError;
      expect(timeoutErr.code).toBe("TIMEOUT_ERROR");
      expect(timeoutErr.statusCode).toBe(504);
      expect(timeoutErr.toApiResponse()).toEqual({
        ok: false,
        data: null,
        error: {
          code: "TIMEOUT_ERROR",
          message: "Upstream request timed out.",
        },
      });
    }
  });

  it("throws NetworkError on DNS or network connectivity failure", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      safeGetJson("https://invalid.domain.local/api", { fetchFn: mockFetch })
    ).rejects.toThrow(NetworkError);

    try {
      await safeGetJson("https://invalid.domain.local/api", { fetchFn: mockFetch });
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(NetworkError);
      const netErr = err as NetworkError;
      expect(netErr.code).toBe("NETWORK_ERROR");
      expect(netErr.statusCode).toBe(502);
      expect(netErr.toApiResponse().error.code).toBe("NETWORK_ERROR");
    }
  });

  it("throws UpstreamError on upstream 401 Unauthorized without leaking sensitive details", async () => {
    const secretApiKey = "my-secret-key-12345";
    const sensitiveRawBody = JSON.stringify({
      error: "Invalid API Key: " + secretApiKey,
      stack: "InternalException at server.ts:42",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => sensitiveRawBody,
      json: async () => JSON.parse(sensitiveRawBody),
    } as unknown as Response);

    try {
      await safeGetJson("https://example.com/cwa-data", {
        headers: { Authorization: `Bearer ${secretApiKey}` },
        fetchFn: mockFetch,
      });
      expect.unreachable();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(UpstreamError);
      const upstreamErr = err as UpstreamError;
      expect(upstreamErr.code).toBe("UPSTREAM_ERROR");
      expect(upstreamErr.upstreamStatus).toBe(401);
      expect(upstreamErr.statusCode).toBe(502);

      // Verify the raw sensitive body and secret are NOT present in the error message
      expect(upstreamErr.message).not.toContain(secretApiKey);
      expect(upstreamErr.message).not.toContain("Invalid API Key");
      expect(upstreamErr.message).not.toContain("InternalException");

      // Verify clean ApiFailure envelope
      const failureResponse = upstreamErr.toApiResponse();
      expect(failureResponse.ok).toBe(false);
      expect(failureResponse.error.code).toBe("UPSTREAM_ERROR");
      expect(failureResponse.error.message).toBe(
        "Upstream service returned error status 401."
      );
    }
  });

  it("throws UpstreamError on upstream 429 Rate Limit", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    } as unknown as Response);

    await expect(
      safeGetJson("https://example.com/cwa", { fetchFn: mockFetch })
    ).rejects.toThrow(UpstreamError);
  });

  it("throws UpstreamError on upstream 500 Server Error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);

    await expect(
      safeGetJson("https://example.com/cwa", { fetchFn: mockFetch })
    ).rejects.toThrow(UpstreamError);
  });

  it("throws ParseError when response is not valid JSON", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    } as unknown as Response);

    await expect(
      safeGetJson("https://example.com/html-endpoint", { fetchFn: mockFetch })
    ).rejects.toThrow(ParseError);

    try {
      await safeGetJson("https://example.com/html-endpoint", { fetchFn: mockFetch });
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ParseError);
      const parseErr = err as ParseError;
      expect(parseErr.code).toBe("PARSE_ERROR");
      expect(parseErr.statusCode).toBe(502);
      expect(parseErr.toApiResponse().error.code).toBe("PARSE_ERROR");
    }
  });
});
