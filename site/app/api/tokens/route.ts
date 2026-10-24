/*
  Token lookup for the picker: search by name/ticker, or paste a mint. Returns name, symbol, icon, decimals.
  GET /api/tokens?q=<text or mint>
  GET /api/tokens?mints=<up to 60 mints, comma separated>   (the tokens in a wallet: adds usdPrice)
*/
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SOURCES = ['https://lite-api.jup.ag/tokens/v2/search', 'https://api.jup.ag/tokens/v2/search']

const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const mints = (sp.get('mints') || '').split(',').filter((m) => MINT.test(m)).slice(0, 60)
  const q = mints.length ? mints.join(',') : (sp.get('q') || '').trim()
  if (!mints.length && (q.length < 2 || q.length > 64 || !/^[\w .$-]+$/.test(q))) return Response.json([])
  for (const base of SOURCES) {
    try {
      const r = await fetch(`${base}?query=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(8_000), cache: 'no-store' })
      if (!r.ok) continue
      const list = (await r.json()) as any[]
      const out = list
        .filter((t) => t && typeof t.id === 'string' && typeof t.decimals === 'number')
        .filter((t) => !mints.length || mints.includes(t.id))
        .slice(0, mints.length || 8)
        .map((t) => ({ mint: t.id, symbol: String(t.symbol || '').slice(0, 14), name: String(t.name || '').slice(0, 40), decimals: t.decimals, icon: typeof t.icon === 'string' && t.icon.startsWith('https://') ? t.icon : undefined, verified: !!t.isVerified, ...(mints.length && typeof t.usdPrice === 'number' ? { usdPrice: t.usdPrice } : {}) }))
      return Response.json(out, { headers: { 'cache-control': 'public, max-age=30' } })
    } catch {}
  }
  return Response.json([], { status: 502 })
}
