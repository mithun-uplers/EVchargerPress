import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents is off for the MVP to keep auth-aware pages simple.
  // Revisit later for performance (see node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md).
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
