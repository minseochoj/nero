import { ImageResponse } from 'next/og'
import { LOGO_SVG } from '@/lib/logoSvg'

// One share card for every page: the same mark and type, different words.
export const OG_SIZE = { width: 1200, height: 630 }
export const OG_TYPE = 'image/png'

const logo = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString('base64')}`

export function ogCard({ kicker, title, sub }: { kicker: string; title: string; sub: string }) {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#09090a', display: 'flex', alignItems: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 0 0 80px', gap: 24, width: 700 }}>
          <div style={{ color: '#8e8d93', fontSize: 30 }}>{kicker}</div>
          <div style={{ color: '#f3f1ec', fontSize: 88, lineHeight: 1, letterSpacing: -3 }}>{title}</div>
          <div style={{ color: '#8e8d93', fontSize: 30, lineHeight: 1.35 }}>{sub}</div>
        </div>
        <img src={logo} width={460} height={460} style={{ marginLeft: 10 }} />
      </div>
    ),
    OG_SIZE,
  )
}
