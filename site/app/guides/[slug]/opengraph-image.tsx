import { ogCard, OG_SIZE, OG_TYPE } from '@/lib/og'
import { GUIDES, guide } from '@/lib/guides'

export const size = OG_SIZE
export const contentType = OG_TYPE
export const alt = 'Nero guide'
export const generateStaticParams = () => GUIDES.map((g) => ({ slug: g.slug }))

export default async function OG({ params }: { params: { slug: string } | Promise<{ slug: string }> }) {
  const g = guide((await params).slug)
  return ogCard({ kicker: 'Nero · Guide', title: g?.card || 'Guides.', sub: 'Real Monero at your own address, step by step.' })
}
