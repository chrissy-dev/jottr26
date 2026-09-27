import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // When this build was made, shown in the settings so a new deploy can be
    // told apart from the last.
    BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
