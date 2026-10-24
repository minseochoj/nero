/*
  Our Monero node, checked against public ones. GET /api/node
  ours       height, top block hash and sync state, as our solver reads its own node
  reference  a public Monero node we do not run: its height, and the hash it has for our top block.
             The same hash at the same height means our node is on the real Monero chain.
*/
import { solverGet } from '@/lib/server/stats'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// independent public nodes, tried in order until one answers
const PUBLIC_NODES = ['http://node.sethforprivacy.com:18089', 'http://xmr-node.cakewallet.com:18081', 'http://nodes.hashvault.pro:18081', 'http://xmr.stormycloud.org:18089']

type Ours = { height: number; targetHeight: number; synchronized: boolean; topBlockHash: string; walletHeight: number | null; at: number }

async function reference(topHeight: number) {
  for (const n of PUBLIC_NODES) {
    try {
      const [h, hdr] = await Promise.all([
        fetch(`${n}/get_height`, { signal: AbortSignal.timeout(5_000), cache: 'no-store' }).then((r) => r.json()),
        fetch(`${n}/json_rpc`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'get_block_header_by_height', params: { height: topHeight } }), signal: AbortSignal.timeout(5_000), cache: 'no-store' }).then((r) => r.json()),
      ])
      const hash = hdr?.result?.block_header?.hash
      if (typeof h?.height === 'number' && typeof hash === 'string') return { node: new URL(n).hostname, height: h.height as number, hashAtOurTop: hash }
    } catch {}
  }
  return null
}

let cache: { at: number; v: unknown } | null = null
export async function GET() {
  if (cache && Date.now() - cache.at < 20_000) return Response.json(cache.v, { headers: { 'cache-control': 'no-store' } })
  const ours = await solverGet<Ours>('/v2/node')
  if (!ours) return Response.json({ ours: null, reference: null, error: 'our node is not answering' }, { status: 503 })
  const ref = await reference(ours.height - 1)
  const v = { ours, reference: ref ? { ...ref, match: ref.hashAtOurTop === ours.topBlockHash } : null }
  cache = { at: Date.now(), v }
  return Response.json(v, { headers: { 'cache-control': 'no-store' } })
}
