import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Native/WASM database drivers are loaded from node_modules at runtime instead of bundled.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  // The demo database seed is read from disk at runtime; include it in serverless bundles.
  outputFileTracingIncludes: {
    "/api/**": ["./db/demo-seed.sql"],
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
