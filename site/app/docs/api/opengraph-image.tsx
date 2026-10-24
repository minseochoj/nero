import { ogCard, OG_SIZE, OG_TYPE } from '@/lib/og'

export const size = OG_SIZE
export const contentType = OG_TYPE
export const alt = 'Nero for integrators'

export default function OG() {
  return ogCard({ kicker: 'Nero · For integrators', title: 'Link in, read out.', sub: 'One link to a prefilled exit. Public numbers as JSON and CSV.' })
}
