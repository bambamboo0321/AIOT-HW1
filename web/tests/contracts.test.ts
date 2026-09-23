import { describe, it, expect } from "vitest";
import {
  createSuccessResponse,
  createFailureResponse,
  ApiResponse,
} from "@/lib/contracts/api";

describe("API Contract Envelope", () => {
  it("creates a standardized success envelope", () => {
    const data = { count: 42, label: "test" };
    const response: ApiResponse<typeof data> = createSuccessResponse(data);

    expect(response.ok).toBe(true);
    expect(response.error).toBeNull();
    if (response.ok) {
      expect(response.data).toEqual({ count: 42, label: "test" });
    }
  });

  it("creates a standardized failure envelope", () => {
    const response = createFailureResponse("UPSTREAM_ERROR", "Service unavailable");

    expect(response.ok).toBe(false);
    expect(response.data).toBeNull();
    if (!response.ok) {
      expect(response.error).toEqual({
        code: "UPSTREAM_ERROR",
        message: "Service unavailable",
      });
    }
  });

  it("ensures failure envelope does not leak raw stack traces or internal details", () => {
    const response = createFailureResponse("CONFIG_ERROR", "Configuration missing");

    expect(Object.keys(response)).toEqual(["ok", "data", "error"]);
    expect(Object.keys(response.error)).toEqual(["code", "message"]);
    expect(response.error.code).toBe("CONFIG_ERROR");
  });
});
