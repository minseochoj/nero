import { Connection } from '@solana/web3.js'
import { BRIDGE_PROGRAM } from '../lib/constants'
import { eventsFromLogs } from '../lib/bridge'
const c = new Connection(process.env.RPC!, 'confirmed')
const sigs = await c.getSignaturesForAddress(BRIDGE_PROGRAM, { limit: 60 })
let n = 0
for (const s of sigs) {
  if (s.err) continue
  const tx = await c.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 })
  const ev = eventsFromLogs(tx?.meta?.logMessages)
  if (!ev.length) continue
  console.log(new Date((s.blockTime || 0) * 1000).toISOString(), s.signature.slice(0, 10), JSON.stringify(ev, (k, v) => typeof v === 'bigint' ? v.toString() : v))
  if (++n > 8) break
}
