import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
    proxyClientMaxBodySize: "500mb",
  },
  serverExternalPackages: [
    "fluent-ffmpeg",
    "@remotion/bundler",
    "@remotion/renderer",
    "@remotion/media-utils",
    "remotion",
  ],
};

export default nextConfig;
