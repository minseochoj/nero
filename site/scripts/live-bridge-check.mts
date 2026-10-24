// Read-only: decode the live bridge config + recent withdrawal records with our hand-rolled decoders.
import { Connection } from '@solana/web3.js'
import bs58 from 'bs58'
import { BRIDGE_PROGRAM } from '../lib/constants'
import { configPda, decodeConfig, decodeWithdrawal, decodeDeposit, eventsFromLogs, withdrawalPda } from '../lib/bridge'
import { checkMoneroAddress } from '../lib/monero'

const c = new Connection(process.env.RPC!, 'confirmed')
const cfg = await c.getAccountInfo(configPda())
console.log('config', decodeConfig(cfg!.data))
const wd = await c.getProgramAccounts(BRIDGE_PROGRAM, { filters: [{ memcmp: { offset: 0, bytes: bs58.encode(Uint8Array.from([88, 59, 154, 202, 216, 210, 211, 237])) } }] })
console.log('withdrawal records', wd.length)
const counts: Record<string, number> = {}
for (const a of wd) { const d = decodeWithdrawal(a.account.data); counts[d.status] = (counts[d.status] || 0) + 1 }
console.log(counts)
const s = wd.map(a => ({ k: a.pubkey, d: decodeWithdrawal(a.account.data) })).sort((x, y) => y.d.createdAt - x.d.createdAt)
for (const x of s.slice(0, 3)) {
  const pdaOk = withdrawalPda(new (await import('@solana/web3.js')).PublicKey(x.d.user), x.d.nonce).equals(x.k)
  console.log(x.k.toBase58(), x.d.status, Number(x.d.amount) / 1e12, 'fee', Number(x.d.fee) / 1e12, new Date(x.d.createdAt * 1000).toISOString(), 'pda ok', pdaOk, 'addr', checkMoneroAddress(x.d.xmrAddress))
}
const dep = await c.getProgramAccounts(BRIDGE_PROGRAM, { filters: [{ memcmp: { offset: 0, bytes: bs58.encode(Uint8Array.from([83, 232, 10, 31, 251, 49, 189, 167])) } }] })
console.log('deposit records', dep.length, dep.slice(0, 2).map(a => { const d = decodeDeposit(a.account.data); return { ...d, totalDeposited: Number(d.totalDeposited) / 1e12, addr: checkMoneroAddress(d.xmrAddress) } }))
// events on the most recent completed one
const done = s.find(x => x.d.status === 'completed')
if (done) {
  const sigs = await c.getSignaturesForAddress(done.k, { limit: 5 })
  for (const sg of sigs) {
    const tx = await c.getTransaction(sg.signature, { maxSupportedTransactionVersion: 0 })
    console.log(sg.signature.slice(0, 12), eventsFromLogs(tx?.meta?.logMessages).map(e => ({ ...e, amount: String((e as any).amount), fee: String((e as any).fee ?? ''), nonce: String((e as any).nonce ?? '') })))
  }
}
