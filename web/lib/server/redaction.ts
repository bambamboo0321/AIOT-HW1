/**
 * Defense-in-depth Redaction Helper
 *
 * Public error responses should always prefer fixed, generic error messages.
 * This redaction helper provides secondary defense against accidental leaks
 * in server logs or secondary error messages.
 *
 * Does NOT serialize process.env.
 * Does NOT log or expose full request headers.
 */

const SENSITIVE_QUERY_PARAMS = new Set([
  "authorization",
  "auth",
  "token",
  "access_token",
  "api_key",
  "apikey",
  "key",
  "secret",
  "password",
  "admin_password",
]);

/**
 * Sanitizes a URL string by masking sensitive query parameters.
 */
export function sanitizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    let modified = false;

    for (const [key] of url.searchParams.entries()) {
      if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) {
        url.searchParams.set(key, "[REDACTED]");
        modified = true;
      }
    }

    return modified ? url.toString() : rawUrl;
  } catch {
    // If not a full URL, fallback to regex-based query masking
    return rawUrl.replace(
      /([?&](?:authorization|auth|token|access_token|api_key|apikey|key|secret|password)=)[^&]+/gi,
      "$1[REDACTED]"
    );
  }
}

/**
 * Redacts known sensitive patterns and explicitly provided secret values from text.
 */
export function redactSensitiveText(
  text: string,
  additionalSecrets: (string | undefined | null)[] = []
): string {
  if (!text) return text;

  let result = text;

  // 1. Redact Authorization / Bearer tokens pattern
  result = result.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, "Bearer [REDACTED]");
  result = result.replace(/(Authorization:\s*)[^\r\n]+/gi, "$1[REDACTED]");

  // 2. Redact query-string like tokens in text
  result = result.replace(
    /([?&](?:authorization|auth|token|access_token|api_key|apikey|key|secret|password)=)[^&\s]+/gi,
    "$1[REDACTED]"
  );

  // 3. Redact known environment secrets if present (only specific known keys, never entire process.env)
  const candidateSecrets = [
    process.env.CWA_API_KEY,
    process.env.MOENV_API_KEY,
    process.env.ADMIN_PASSWORD,
    ...additionalSecrets,
  ].filter((s): s is string => typeof s === "string" && s.trim().length >= 4);

  for (const secret of candidateSecrets) {
    if (result.includes(secret)) {
      result = result.split(secret).join("[REDACTED]");
    }
  }

  return result;
}
