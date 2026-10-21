import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const isExport = process.env.NEXT_OUTPUT === "export";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  // Pin the workspace root so stray lockfiles in parent folders aren't picked up.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  // Static export (served by FastAPI in production); `next dev` is unaffected.
  ...(isExport ? { output: "export", images: { unoptimized: true } } : {}),
};

export default nextConfig;
