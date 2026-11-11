import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Keep these server-only image libraries out of the webpack/turbopack
  // bundle so they're traced and copied as real node_modules into the
  // serverless function. heic-convert pulls a large libheif WASM blob;
  // sharp ships platform-specific native binaries. Both must resolve at
  // runtime on the deployment platform's Node.js runtime.
  serverExternalPackages: ["sharp", "heic-convert"],
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
