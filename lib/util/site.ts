/** The public origin, for canonical URLs, the sitemap and social previews.
 *
 *  `SITE_URL` names it outright, for a build hosted anywhere but Vercel.
 *  Vercel sets `VERCEL_PROJECT_PRODUCTION_URL` on every build to the project's
 *  production domain (the custom one, if assigned), so preview deploys still
 *  point search engines at production rather than at themselves. */
export const SITE_URL = new URL(
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000"),
);

export const TAGLINE = "Clean, fast, feature-packed, no-AI notes app";
