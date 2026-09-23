import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable automatic generation of AGENTS.md / CLAUDE.md
  agentRules: false,
};

export default nextConfig;
