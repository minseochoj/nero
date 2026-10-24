export const short = (a: string, n = 4) => (a.length > 2 * n + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a)

/** Raw integer (string/bigint) with `dec` decimals -> human string, trimmed. */
export function fromRaw(raw: string | bigint | number, dec: number, maxFrac = 6): string {
  const v = BigInt(typeof raw === 'number' ? Math.floor(raw) : raw)
  const neg = v < 0n
  const a = neg ? -v : v
  const base = 10n ** BigInt(dec)
  const whole = a / base
  const frac = (a % base).toString().padStart(dec, '0').slice(0, maxFrac).replace(/0+$/, '')
  return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${frac ? `.${frac}` : ''}`
}

/** Human decimal string -> raw bigint (truncates extra decimals). Null if not a number. */
export function toRaw(s: string, dec: number): bigint | null {
  const t = s.trim().replace(/,/g, '')
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null
  const [w, f = ''] = t.split('.')
  return BigInt(w || '0') * 10n ** BigInt(dec) + BigInt((f + '0'.repeat(dec)).slice(0, dec) || '0')
}

export const xmr = (pico: string | bigint, frac = 4) => fromRaw(pico, 12, frac)
export const usd = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `$${Math.round(n / 1e3)}k` : `$${n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 2 : 0 })}`
/** "≈ $12.34" for a rough dollar value next to an amount; empty when there is no price or nothing to show. */
export const approxUsd = (n: number) =>
  !isFinite(n) || n <= 0 ? '' : n < 0.01 ? '≈ under $0.01' : `≈ $${n.toLocaleString('en-US', n >= 1000 ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const ago = (t: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - t))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
