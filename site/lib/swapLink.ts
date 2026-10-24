import { EXIT_TOKENS } from './tokens'

// The link format other sites use to send someone to a prefilled exit. The swap forms read exactly these three
// parameters (`in`, `amount`, `tab`); the Monero address is never one of them, so a link cannot choose where
// the money goes.
export const LINK_TABS = ['private', 'exit', 'enter'] as const
export type LinkTab = (typeof LINK_TABS)[number]
export type LinkToken = (typeof EXIT_TOKENS)[number]['symbol']

const AMOUNT = /^(\d+\.?\d*|\.\d+)$/

export function swapLink(base: string, o: { token?: LinkToken; amount?: string; tab?: LinkTab } = {}): string {
  const q: string[] = []
  if (o.tab && o.tab !== 'private') {
    if (!LINK_TABS.includes(o.tab)) throw new Error('unknown tab')
    q.push(`tab=${o.tab}`)
  }
  if (o.token) {
    const t = EXIT_TOKENS.find((x) => x.symbol === o.token)
    if (!t) throw new Error('unknown token')
    q.push(`in=${t.mint}`)
  }
  if (o.amount !== undefined) {
    if (!AMOUNT.test(o.amount)) throw new Error('amount must be digits with at most one dot')
    q.push(`amount=${o.amount}`)
  }
  return `${base.replace(/\/$/, '')}/swap${q.length ? `?${q.join('&')}` : ''}`
}
