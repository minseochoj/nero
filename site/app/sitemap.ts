import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'
import { GUIDES } from '@/lib/guides'
import { PUBLIC_PATH } from '@/lib/whatIsPublic'

// Every public page. Add a line here when a new page ships.
const PAGES: [path: string, changeFrequency: 'hourly' | 'daily' | 'weekly', priority: number][] = [
  ['', 'daily', 1],
  ['/swap', 'daily', 0.9],
  ['/verify', 'daily', 0.8],
  ['/help', 'weekly', 0.7],
  ['/docs', 'weekly', 0.7],
  ['/docs/api', 'weekly', 0.5],
  [PUBLIC_PATH, 'weekly', 0.6],
  ['/status', 'hourly', 0.5],
  ['/guides', 'weekly', 0.6],
  ...GUIDES.map((g): [string, 'weekly', number] => [`/guides/${g.slug}`, 'weekly', 0.7]),
]

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(([path, changeFrequency, priority]) => ({ url: `${BRAND.url}${path}`, changeFrequency, priority }))
}
