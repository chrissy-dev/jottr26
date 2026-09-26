import { execSync } from "node:child_process";
import type { NextConfig } from "next";

/** The commit this build is of, shown in the settings so a new deploy can be
 *  told apart from the last. Vercel names it; a local build asks git. */
function buildCommit() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  env: {
    BUILD_COMMIT: buildCommit(),
    BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
