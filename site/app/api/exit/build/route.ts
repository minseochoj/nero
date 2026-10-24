import { ExitError, buildExit } from '@/lib/server/exit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const hits = new Map<string, { n: number; since: number }>()
function limited(ip: string) {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || now - h.since > 60_000) {
    if (hits.size > 5000) hits.clear()
    hits.set(ip, { n: 1, since: now })
    return false
  }
  return ++h.n > 30
}

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'local'
  if (limited(ip)) return Response.json({ error: 'Too many requests. Wait a minute.' }, { status: 429 })
  let body: any
  try { body = await req.json() } catch { return Response.json({ error: 'expected JSON' }, { status: 400 }) }
  try {
    const r = await buildExit({ wallet: body.wallet, inputMint: body.inputMint, amount: String(body.amount ?? ''), xmrAddress: body.xmrAddress, slippageBps: body.slippageBps })
    return Response.json(r, { headers: { 'cache-control': 'no-store' } })
  } catch (e: any) {
    if (e instanceof ExitError) return Response.json({ error: e.message }, { status: e.status })
    console.error('exit build', e)
    return Response.json({ error: 'Could not build the exit right now. Try again.' }, { status: 502 })
  }
}
