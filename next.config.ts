import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Increase body size limit to support up to 20MB file uploads
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb", // Set to 25MB to allow some overhead for 20MB files
    },
  },
};

export default nextConfig;
