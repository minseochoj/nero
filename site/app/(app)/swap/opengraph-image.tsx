import { ogCard, OG_SIZE, OG_TYPE } from '@/lib/og'

export const size = OG_SIZE
export const contentType = OG_TYPE
export const alt = 'Nero: exit to Monero'

export default function OG() {
  return ogCard({ kicker: 'Nero · Swap', title: 'Exit to Monero.', sub: 'Any Solana token to real XMR. Your Monero address never appears on Solana.' })
}
