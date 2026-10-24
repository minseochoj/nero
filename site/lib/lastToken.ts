import { EXIT_TOKENS } from './tokens'

/*
  The token of your last exit, kept in this browser only (localStorage) so the swap page can offer it first next
  time. It is written after an exit is sent, never when a token is merely picked, and it is never sent anywhere.
  What comes back out of storage is checked again here: it ends up in the form and in an image address.
*/
export type LastToken = { symbol: string; mint: string; decimals: number; icon?: string; name?: string; verified?: boolean }

export const LAST_TOKEN_KEY = 'nero.lastToken'

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)

export function parseLastToken(stored: string | null | undefined): LastToken | null {
  if (!stored) return null
  let j: any
  try { j = JSON.parse(stored) } catch { return null }
  if (!j || typeof j !== 'object' || typeof j.mint !== 'string' || !MINT.test(j.mint)) return null
  // the three shortcuts always come from our own list, whatever was stored
  const short = EXIT_TOKENS.find((t) => t.mint === j.mint)
  if (short) return { ...short }
  const symbol = text(j.symbol, 20)
  if (!symbol || !Number.isInteger(j.decimals) || j.decimals < 1 || j.decimals > 18) return null
  const icon = typeof j.icon === 'string' && j.icon.length <= 500 && (/^https:\/\/[^\s"'<>]+$/.test(j.icon) || /^\/img\/[\w.-]+$/.test(j.icon)) ? j.icon : undefined
  return { symbol, mint: j.mint, decimals: j.decimals, icon, name: text(j.name, 60), verified: j.verified === true ? true : undefined }
}

export function loadLastToken(): LastToken | null {
  try { return parseLastToken(localStorage.getItem(LAST_TOKEN_KEY)) } catch { return null }
}

export function saveLastToken(t: LastToken) {
  try {
    const ok = parseLastToken(JSON.stringify({ symbol: t.symbol, mint: t.mint, decimals: t.decimals, icon: t.icon, name: t.name, verified: t.verified }))
    if (ok) localStorage.setItem(LAST_TOKEN_KEY, JSON.stringify(ok))
  } catch {}
}

/*
  A link that names a token or an amount decides the form by itself: "amount=1" from another site means 1 SOL,
  not 1 of whatever was used here last.
*/
export function mayUseRemembered(search: string): boolean {
  const q = new URLSearchParams(search)
  return !q.has('in') && !q.has('amount')
}

/*
  The rows of the token list when nothing is being searched: the last used token first (with its balance when the
  wallet holds it), then the rest of the wallet, then the shortcuts. No token appears twice.
*/
export function pickerRows<T extends { mint: string }>(last: T | null, mine: T[], common: readonly T[]): { t: T; head?: string }[] {
  const out: { t: T; head?: string }[] = []
  const seen = new Set<string>()
  const add = (rows: readonly T[], head: string) => {
    let first = true
    for (const t of rows) {
      if (seen.has(t.mint)) continue
      seen.add(t.mint)
      out.push(first ? { t, head } : { t })
      first = false
    }
  }
  if (last) add([mine.find((m) => m.mint === last.mint) || last], 'Last used')
  add(mine, 'In your wallet')
  add(common, 'Common')
  // a list of shortcuts only needs no heading
  if (out.length && out.every((r) => !r.head || r.head === 'Common')) delete out[0].head
  return out
}
