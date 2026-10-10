import type { NextConfig } from "next";

const apiOrigin = process.env.API_PROXY_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  logging: {
    incomingRequests: false,
  },
  transpilePackages: ["@supportops/shared", "@supportops/mock-data"],
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
      { source: "/health", destination: `${apiOrigin}/health` },
    ];
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
