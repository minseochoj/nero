import { BRAND } from '@/lib/brand'

/*
  Shown once an exit is paid: a link that opens X with a short post already written. It names no amount, no address
  and no transaction, only that an exit happened and how. Nothing is posted unless the person posts it themselves.
*/
const TEXT: Record<'wallet' | 'send' | 'x', string> = {
  wallet: `Moved from Solana to Monero with @${BRAND.x}. One signature, paid in real XMR, and my Monero address never appeared on Solana.`,
  send: `Moved to Monero with @${BRAND.x} without connecting a wallet: sent SOL to a one-time address, real XMR arrived at mine.`,
  x: `Moved to Monero from another chain with @${BRAND.x}. No wallet connection, and my Monero address stayed sealed the whole way.`,
}

export default function ShareExit({ kind }: { kind: 'wallet' | 'send' | 'x' }) {
  const href = `https://x.com/intent/post?text=${encodeURIComponent(`${TEXT[kind]}\n\n${BRAND.domain}`)}`
  return (
    <a className="btn btn-block" href={href} target="_blank" rel="noreferrer" style={{ textAlign: 'center' }}>
      Share that you exited <span className="faint" style={{ marginLeft: 6, fontSize: 12.5 }}>no amount, no address</span>
    </a>
  )
}
