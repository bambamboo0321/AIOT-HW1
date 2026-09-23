import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("Health API Route", () => {
  it("returns HTTP 200 with standard healthy payload", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      data: {
        service: "aiot-hw1-web",
        status: "healthy",
      },
      error: null,
    });
  });

  it("does not expose secrets, environment variables, node version, or file paths", async () => {
    const response = await GET();
    const rawText = JSON.stringify(await response.json());

    // Strict non-exposure checks
    expect(rawText).not.toContain("process.env");
    expect(rawText).not.toContain("CWA_API_KEY");
    expect(rawText).not.toContain("MOENV_API_KEY");
    expect(rawText).not.toContain("ADMIN_PASSWORD");
    expect(rawText).not.toContain("node_modules");
    expect(rawText).not.toContain(process.version); // e.g. v24.13.1
    expect(rawText).not.toContain("/Users/");
    expect(rawText).not.toContain(process.cwd());
  });

  it("includes Cache-Control no-store header", async () => {
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
});
