/**
 * Server-only Environment Configuration Module
 *
 * Dedicated to retrieving sensitive server credentials.
 * - Server-only execution check
 * - No NEXT_PUBLIC_ prefixes
 * - On-demand validation: missing keys DO NOT fail module import or build
 * - Throws classified ConfigError with no secret values leaked
 */

import { ConfigError } from "./errors";

// Runtime enforcement that this file is never bundled/executed on the client side
if (typeof window !== "undefined") {
  throw new Error("Security Error: server env module cannot be imported in client-side code.");
}

export type SupportedServerSecret =
  | "CWA_API_KEY"
  | "MOENV_API_KEY"
  | "ADMIN_PASSWORD";

/**
 * Retrieves a required server credential from process.env on-demand.
 * Throws ConfigError if missing or empty.
 */
export function getServerSecret(key: SupportedServerSecret): string {
  const val = process.env[key];
  if (!val || val.trim().length === 0) {
    throw new ConfigError(key);
  }
  return val.trim();
}

/**
 * Retrieves optional server credential, returning undefined if unset.
 */
export function getOptionalServerSecret(key: SupportedServerSecret): string | undefined {
  const val = process.env[key];
  if (!val || val.trim().length === 0) {
    return undefined;
  }
  return val.trim();
}

/**
 * Convenience accessor for CWA API Key (validated on-demand).
 */
export function getCwaApiKey(): string {
  return getServerSecret("CWA_API_KEY");
}

/**
 * Convenience accessor for MOENV API Key (validated on-demand).
 */
export function getMoenvApiKey(): string {
  return getServerSecret("MOENV_API_KEY");
}

/**
 * Convenience accessor for ADMIN_PASSWORD (optional in M7).
 */
export function getAdminPassword(): string | undefined {
  return getOptionalServerSecret("ADMIN_PASSWORD");
}
