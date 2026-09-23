/**
 * Unified API Response Contract for Taiwan Weather Dashboard V2
 *
 * Every API endpoint must return a standardized envelope:
 * Success: { ok: true, data: T, error: null }
 * Failure: { ok: false, data: null, error: { code: string, message: string } }
 *
 * Browser-facing messages must remain brief, sanitized, and safe.
 * Never leak internal stack traces, headers, upstream bodies, or secrets.
 */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  error: null;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
}

export interface ApiFailure {
  ok: false;
  data: null;
  error: ApiErrorDetail;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function createSuccessResponse<T>(data: T): ApiSuccess<T> {
  return {
    ok: true,
    data,
    error: null,
  };
}

export function createFailureResponse(code: string, message: string): ApiFailure {
  return {
    ok: false,
    data: null,
    error: {
      code,
      message,
    },
  };
}
