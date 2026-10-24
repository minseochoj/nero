import { configPda, decodeConfig } from '../bridge'
import { SOL_MINT, WXMR_MINT } from '../constants'
import { serverConnection } from './rpc'
import { usdPrices } from './jup'

const SOLVER = process.env.SOLVER_URL || ''

/** The solver's public JSON. Null when it is not connected or unreachable. */
export async function solverGet<T = any>(path: string): Promise<T | null> {
  if (!SOLVER) return null
  try {
    const r = await fetch(`${SOLVER}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(6_000) })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

export type Stats = {
  wxmrSupply: string | null
  bridgeIn: string | null
  bridgeOut: string | null
  bridgeFeeBps: number | null
  xmrUsd: number | null
  solUsd: number | null
  // the private exit (our own solver): totals only
  solver: null | { exits: number; xmrPico: string; refunds: number; reservePico: string | null; enabled: boolean; lastPaidAt: number | null }
  // our own Monero node, as the solver reads it
  node: null | { height: number; targetHeight: number; synchronized: boolean; topBlockHash: string; walletHeight: number | null; at: number }
}

let cache: { at: number; v: Stats } | null = null
export async function getStats(): Promise<Stats> {
  if (cache && Date.now() - cache.at < 30_000) return cache.v
  const conn = serverConnection()
  const [cfgInfo, supply, prices, solver, node] = await Promise.all([
    conn.getAccountInfo(configPda()).catch(() => null),
    conn.getTokenSupply(WXMR_MINT).catch(() => null),
    usdPrices([WXMR_MINT.toBase58(), SOL_MINT.toBase58()]),
    solverGet<Stats['solver']>('/v2/stats'),
    solverGet<Stats['node']>('/v2/node'),
  ])
  let cfg: ReturnType<typeof decodeConfig> | null = null
  try { cfg = cfgInfo ? decodeConfig(cfgInfo.data) : null } catch { cfg = null }
  const v: Stats = {
    wxmrSupply: supply?.value.amount ?? null,
    bridgeIn: cfg ? cfg.totalDeposits.toString() : null,
    bridgeOut: cfg ? cfg.totalWithdrawals.toString() : null,
    bridgeFeeBps: cfg?.feeBps ?? null,
    xmrUsd: prices[WXMR_MINT.toBase58()] ?? null,
    solUsd: prices[SOL_MINT.toBase58()] ?? null,
    solver,
    node,
  }
  cache = { at: Date.now(), v }
  return v
}
