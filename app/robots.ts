import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/util/site'

// Built once, so a static export can include it.
export const dynamic = 'force-static'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Client-rendered shells: to a crawler they are a spinner and a redirect.
      disallow: ['/app', '/login'],
    },
    sitemap: new URL('/sitemap.xml', SITE_URL).href,
  }
}
