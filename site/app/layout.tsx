import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Shell from '@/components/Shell'
import { BRAND } from '@/lib/brand'
import './globals.css'

const geist = Geist({ subsets: ['latin'], variable: '--geist' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--geist-mono' })

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: { default: `${BRAND.name} | Swap from Solana to real Monero`, template: `%s | ${BRAND.name}` },
  description: BRAND.description,
  openGraph: { title: BRAND.name, description: BRAND.description, url: BRAND.url, siteName: BRAND.name, type: 'website' },
  twitter: { card: 'summary_large_image', title: BRAND.name, description: BRAND.description },
}
export const viewport: Viewport = { themeColor: '#09090a', width: 'device-width', initialScale: 1 }

const fontVars = {
  '--sans': 'var(--geist), ui-sans-serif, system-ui, sans-serif',
  '--mono': 'var(--geist-mono), ui-monospace, monospace',
} as React.CSSProperties

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${mono.variable}`} style={fontVars}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  )
}
