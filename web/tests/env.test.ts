import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getServerSecret,
  getOptionalServerSecret,
  getCwaApiKey,
  getMoenvApiKey,
  getAdminPassword,
} from "@/lib/server/env";
import { ConfigError } from "@/lib/server/errors";

describe("Server-only Environment Module", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear targeted keys before each test
    delete process.env.CWA_API_KEY;
    delete process.env.MOENV_API_KEY;
    delete process.env.ADMIN_PASSWORD;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  it("retrieves a configured server secret successfully", () => {
    process.env.CWA_API_KEY = "test-cwa-key-value";
    expect(getServerSecret("CWA_API_KEY")).toBe("test-cwa-key-value");
  });

  it("throws classified ConfigError when a required secret is missing", () => {
    expect(() => getServerSecret("CWA_API_KEY")).toThrow(ConfigError);

    try {
      getServerSecret("CWA_API_KEY");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ConfigError);
      const configErr = err as ConfigError;
      expect(configErr.code).toBe("CONFIG_ERROR");
      expect(configErr.statusCode).toBe(500);
      expect(configErr.missingKey).toBe("CWA_API_KEY");
      expect(configErr.message).toContain("CWA_API_KEY");
    }
  });

  it("throws ConfigError when secret is empty or whitespace only", () => {
    process.env.CWA_API_KEY = "   ";
    expect(() => getServerSecret("CWA_API_KEY")).toThrow(ConfigError);
  });

  it("does not leak other environment values in ConfigError messages", () => {
    process.env.SOME_SECRET = "super-confidential-token-12345";
    try {
      getServerSecret("MOENV_API_KEY");
    } catch (err: unknown) {
      const configErr = err as ConfigError;
      expect(configErr.message).not.toContain("super-confidential-token-12345");
      expect(configErr.message).not.toContain("SOME_SECRET");
    }
  });

  it("validates on-demand and does not require all keys simultaneously", () => {
    process.env.CWA_API_KEY = "cwa-only-key";
    delete process.env.MOENV_API_KEY;

    // getCwaApiKey should succeed without throwing error about missing MOENV key
    expect(getCwaApiKey()).toBe("cwa-only-key");
    expect(() => getMoenvApiKey()).toThrow(ConfigError);

    // Swap: MOENV key set, CWA missing
    process.env.MOENV_API_KEY = "moenv-only-key";
    delete process.env.CWA_API_KEY;
    expect(getMoenvApiKey()).toBe("moenv-only-key");
    expect(() => getCwaApiKey()).toThrow(ConfigError);
  });

  it("handles optional server secret returning undefined when unset", () => {
    expect(getOptionalServerSecret("ADMIN_PASSWORD")).toBeUndefined();
    expect(getAdminPassword()).toBeUndefined();

    process.env.ADMIN_PASSWORD = "test-password";
    expect(getAdminPassword()).toBe("test-password");
  });
});
