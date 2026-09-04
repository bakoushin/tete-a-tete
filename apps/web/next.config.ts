import type { NextConfig } from "next";
import path from "node:path";

// Standalone output is for self-hosting (Stasho App VM, Docker, any Node host).
// Vercel builds its own serverless bundle and chokes on standalone + a monorepo tracing root.
const selfHosted = !process.env.VERCEL;

const nextConfig: NextConfig = {
  ...(selfHosted ? { output: "standalone", outputFileTracingRoot: path.join(__dirname, "../../") } : {}),
  transpilePackages: ["@tat/core"],
};

export default nextConfig;
