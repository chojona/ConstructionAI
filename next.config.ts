import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas"],
  experimental: {
    authInterrupts: true,
  },
};

export default nextConfig;
