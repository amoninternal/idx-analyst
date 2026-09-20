import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DuckDB ships a native binary; load it with Node's require instead of bundling it.
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],
};

export default nextConfig;
