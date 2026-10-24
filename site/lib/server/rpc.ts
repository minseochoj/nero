/*
  Server-only chain access. The keyed RPC url never reaches the browser; the
  browser talks to /api/rpc, an allowlisted relay. Every call has a timeout.
*/
import { Connection } from '@solana/web3.js'

export const RPC_URL = process.env.HELIUS_RPC_URL || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

const timedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) })

let conn: Connection | null = null
export function serverConnection() {
  if (!conn) conn = new Connection(RPC_URL, { commitment: 'confirmed', fetch: timedFetch })
  return conn
}
