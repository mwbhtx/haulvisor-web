import type { NextConfig } from "next";
import fs from "fs";

const isProd = process.env.NODE_ENV === "production";
const hasLocalCore = fs.existsSync(".core");

const nextConfig: NextConfig = {
  ...(hasLocalCore
    ? {
        turbopack: {
          resolveAlias: {
            "@mwbhtx/haulvisor-core": "./.core",
            "@mwbhtx/haulvisor-core/dist/*": "./.core/*",
          },
        },
      }
    : {}),
  // Static export for production builds only.
  ...(isProd ? { output: "export", trailingSlash: true } : {}),

  // Proxy /api requests to the NestJS backend during local development.
  // This is a no-op in production builds (output: 'export' ignores rewrites).
  ...(!isProd
    ? {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://localhost:3100/api/:path*",
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
