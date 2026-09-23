import React from "react";

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding: "48px 24px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        lineHeight: 1.6,
      }}
    >
      <header style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "2rem", marginBottom: "8px" }}>
          Taiwan Weather Dashboard V2
        </h1>
        <p style={{ color: "#666", fontSize: "1.1rem" }}>
          Next.js / Vercel foundation — Milestone M8
        </p>
      </header>

      <section
        style={{
          border: "1px solid #e0e0e0",
          borderRadius: "8px",
          padding: "24px",
          marginBottom: "24px",
          backgroundColor: "rgba(0, 0, 0, 0.02)",
        }}
      >
        <h2 style={{ fontSize: "1.25rem", marginBottom: "12px" }}>
          System Status & Overview
        </h2>
        <ul style={{ paddingLeft: "20px", margin: 0 }}>
          <li style={{ marginBottom: "8px" }}>
            <strong>Milestone M7:</strong> Web application foundation, unified API
            contracts, safe server HTTP client, and health endpoints established.
          </li>
          <li style={{ marginBottom: "8px" }}>
            <strong>Milestone M8:</strong> CWA 7-day county/city weather forecast
            server API (<code>/api/weather/forecast</code>) established.
          </li>
          <li style={{ marginBottom: "8px" }}>
            <strong>Existing Application:</strong> The Streamlit version remains
            available and fully operational.
          </li>
          <li style={{ marginBottom: "8px" }}>
            <strong>Future Integration:</strong> Weather observation, air quality
            (MOENV), and UV API integrations will be added in later milestones.
          </li>
          <li>
            <strong>Health Check:</strong> The service health endpoint is
            available at <code>/api/health</code>.
          </li>
        </ul>
      </section>

      <footer style={{ marginTop: "40px", fontSize: "0.875rem", color: "#888" }}>
        <p>AIOT Course Homework 1 — V2 Stateless Web Architecture</p>
      </footer>
    </main>
  );
}
