// Build real exits (simulation only), then check verifyExit accepts them and rejects tampered copies.
import { PublicKey, VersionedTransaction } from '@solana/web3.js'
import { buildExit } from '../lib/server/exit'
import { serverConnection } from '../lib/server/rpc'
import { verifyExit } from '../lib/verifyExit'
const user = new PublicKey('5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9')
const xmr = '82wez4jsocbZf9DAYmM5HsbKre6pnE5LuSCnbAwVJDTKKYEfuvKeacaTgRddrJvVSBB6PwisuYtNvZes37G2PVJ3EKWgJYX'
const conn = serverConnection()
let fails = 0
for (const [mint, amt] of [['So11111111111111111111111111111111111111112', '1000000000'], ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', '80000000']]) {
  const r = await buildExit({ wallet: user.toBase58(), inputMint: mint, amount: amt, xmrAddress: xmr })
  const raw = Buffer.from(r.tx, 'base64')
  const tx = VersionedTransaction.deserialize(raw)
  const alts = (await Promise.all(tx.message.addressTableLookups.map((l) => conn.getAddressLookupTable(l.accountKey)))).map((x) => x.value!).filter(Boolean)
  const min = (BigInt(r.quote.minOut) * 97n) / 100n
  const ok = verifyExit(tx, alts, { user, xmrAddress: xmr, minAmount: min })
  console.log(mint.slice(0, 4), 'genuine ->', ok ?? 'ACCEPTED')
  if (ok) fails++
  // tampered: a different address of the same length, a lower amount, wrong user, wrong min
  const t1 = VersionedTransaction.deserialize(raw); const b1 = t1.message.compiledInstructions.at(-1)!; b1.data[40] = b1.data[40] === 65 ? 66 : 65
  const t2 = VersionedTransaction.deserialize(raw); const b2 = t2.message.compiledInstructions.at(-1)!; new DataView(b2.data.buffer, b2.data.byteOffset).setBigUint64(16, 1n, true)
  const cases: [string, string | null][] = [
    ['changed address', verifyExit(t1, alts, { user, xmrAddress: xmr, minAmount: min })],
    ['amount 1 pico', verifyExit(t2, alts, { user, xmrAddress: xmr, minAmount: min })],
    ['other user', verifyExit(tx, alts, { user: new PublicKey('11111111111111111111111111111112'), xmrAddress: xmr, minAmount: min })],
    ['quote higher than tx', verifyExit(tx, alts, { user, xmrAddress: xmr, minAmount: BigInt(r.quote.minOut) * 2n })],
  ]
  for (const [n, v] of cases) { console.log('   ', n, '->', v ?? 'ACCEPTED (BAD)'); if (!v) fails++ }
}
console.log(fails ? `FAIL ${fails}` : 'all checks behave')
