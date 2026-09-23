import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sanitizeUrl, redactSensitiveText } from "@/lib/server/redaction";

describe("Redaction Helpers", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CWA_API_KEY = "cwa-super-secret-key-9999";
    process.env.MOENV_API_KEY = "moenv-super-secret-key-8888";
    process.env.ADMIN_PASSWORD = "admin-secret-password-7777";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("sanitizeUrl", () => {
    it("masks sensitive query parameters in full URLs", () => {
      const url =
        "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001?Authorization=cwa-secret-key&limit=10";
      const sanitized = sanitizeUrl(url);

      expect(sanitized).toContain("Authorization=%5BREDACTED%5D");
      expect(sanitized).not.toContain("cwa-secret-key");
      expect(sanitized).toContain("limit=10");
    });

    it("masks apiKey, token, and secret query parameters", () => {
      const url =
        "https://data.moenv.gov.tw/api/v2/aqx_p_432?api_key=my-token-123&format=json";
      const sanitized = sanitizeUrl(url);

      expect(sanitized).toContain("api_key=%5BREDACTED%5D");
      expect(sanitized).not.toContain("my-token-123");
      expect(sanitized).toContain("format=json");
    });

    it("leaves safe URLs untouched", () => {
      const url = "https://example.com/api/weather?locationName=Taipei&days=3";
      expect(sanitizeUrl(url)).toBe(url);
    });
  });

  describe("redactSensitiveText", () => {
    it("masks Authorization Bearer tokens in text", () => {
      const text = "Request failed: Authorization: Bearer abc123def456-secret.token";
      const redacted = redactSensitiveText(text);

      expect(redacted).toContain("Authorization: [REDACTED]");
      expect(redacted).not.toContain("abc123def456-secret.token");
    });

    it("masks known server environment secrets when present in text", () => {
      const text = `Error connecting with CWA key cwa-super-secret-key-9999 or moenv-super-secret-key-8888`;
      const redacted = redactSensitiveText(text);

      expect(redacted).not.toContain("cwa-super-secret-key-9999");
      expect(redacted).not.toContain("moenv-super-secret-key-8888");
      expect(redacted).toContain("[REDACTED]");
    });

    it("masks custom sensitive strings passed to helper", () => {
      const text = "User password was my-custom-secret-pass";
      const redacted = redactSensitiveText(text, ["my-custom-secret-pass"]);

      expect(redacted).not.toContain("my-custom-secret-pass");
      expect(redacted).toContain("[REDACTED]");
    });

    it("preserves regular safe strings without altering them", () => {
      const safeText = "Failed to connect to weather service. Status 502.";
      expect(redactSensitiveText(safeText)).toBe(safeText);
    });
  });
});
