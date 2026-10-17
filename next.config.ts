import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
  // Resume readers load at runtime in Node instead of being bundled.
  serverExternalPackages: ["unpdf", "mammoth"],
};

export default nextConfig;
