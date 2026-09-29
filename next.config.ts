import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // JOTTR_STATIC_EXPORT=1 builds plain files into out/, for any web server to
  // host. The app has no server code, so the export is the whole app.
  ...(process.env.JOTTR_STATIC_EXPORT === "1" && { output: "export" }),
  env: {
    // When this build was made, shown in the settings so a new deploy can be
    // told apart from the last.
    BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
