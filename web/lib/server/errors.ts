/**
 * Error Taxonomy for Taiwan Weather Dashboard V2
 *
 * Defines classified server errors that can be safely mapped to ApiFailure responses.
 * Public error messages are intentionally concise and generic to prevent leaking
 * internal paths, stack traces, upstream raw bodies, or environment values.
 */

import { ApiFailure, createFailureResponse } from "../contracts/api";
import { sanitizeUrl } from "./redaction";

export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Maintain proper prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toApiResponse(): ApiFailure {
    return createFailureResponse(this.code, sanitizeUrl(this.message));
  }
}

/**
 * Thrown when a required server configuration or secret is missing.
 */
export class ConfigError extends AppError {
  readonly code = "CONFIG_ERROR";
  readonly statusCode = 500;

  constructor(public readonly missingKey: string) {
    // Intentionally only mentions the missing key name, NEVER any values or environment state
    super(`Server configuration error: required credential '${missingKey}' is missing.`);
  }
}

/**
 * Thrown when an upstream HTTP request exceeds its timeout threshold.
 */
export class TimeoutError extends AppError {
  readonly code = "TIMEOUT_ERROR";
  readonly statusCode = 504;

  constructor(message = "Upstream request timed out.") {
    super(message);
  }
}

/**
 * Thrown when a network connectivity or DNS failure occurs.
 */
export class NetworkError extends AppError {
  readonly code = "NETWORK_ERROR";
  readonly statusCode = 502;

  constructor(message = "Network error connecting to upstream service.") {
    super(message);
  }
}

/**
 * Thrown when an upstream service returns a non-2xx status code.
 * Raw upstream response bodies, headers, and secrets are strictly excluded.
 */
export class UpstreamError extends AppError {
  readonly code = "UPSTREAM_ERROR";
  readonly statusCode = 502;

  constructor(public readonly upstreamStatus: number) {
    super(`Upstream service returned error status ${upstreamStatus}.`);
  }
}

/**
 * Thrown when an upstream response cannot be parsed as expected JSON.
 */
export class ParseError extends AppError {
  readonly code = "PARSE_ERROR";
  readonly statusCode = 502;

  constructor(message = "Invalid JSON response received from upstream service.") {
    super(message);
  }
}
