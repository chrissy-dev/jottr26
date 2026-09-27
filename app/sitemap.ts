import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/util/site'

// Built once, so a static export can include it.
export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL.href, changeFrequency: 'monthly', priority: 1 }]
}
