/*
  GET /api/enter?owner=<wallet>
  The XMR -> Solana side: the wallet's bridge deposit account (its Monero
  subaddress once the relayer assigns one), what it has minted, and any wXMR
  parked in the deposit's holding account waiting to be claimed.
*/
import { PublicKey } from '@solana/web3.js'
import { ata, decodeDeposit, depositPda } from '@/lib/bridge'
import { serverConnection } from '@/lib/server/rpc'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function tokenAmount(a: PublicKey): Promise<string> {
  const r = await serverConnection().getTokenAccountBalance(a).catch(() => null)
  return r?.value.amount ?? '0'
}

export async function GET(req: Request) {
  let owner: PublicKey
  try { owner = new PublicKey(new URL(req.url).searchParams.get('owner') || '') } catch { return Response.json({ error: 'bad wallet' }, { status: 400 }) }
  try {
    const dep = depositPda(owner)
    const info = await serverConnection().getAccountInfo(dep)
    const [wallet, pending] = await Promise.all([tokenAmount(ata(owner)), tokenAmount(ata(dep))])
    const d = info ? decodeDeposit(info.data) : null
    return Response.json({
      account: d ? { address: d.xmrAddress || null, status: d.status, totalDeposited: d.totalDeposited.toString(), createdAt: d.createdAt } : null,
      wxmr: wallet, pending,
    }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 502 })
  }
}
