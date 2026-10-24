import type { Metadata } from 'next'
import { BRAND } from '@/lib/brand'

// Page metadata whose shared-link title, text and address match the page itself (not the home page's).
export function pageMeta(title: string, description: string, path: string): Metadata {
  const full = `${title} | ${BRAND.name}`
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: full, description, url: path, siteName: BRAND.name, type: 'website' },
    twitter: { card: 'summary_large_image', title: full, description },
  }
}
