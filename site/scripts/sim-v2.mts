// Simulation only (nothing signed or sent): the browser's v2 flow against a solver URL.
// quote -> checkQuote -> seal -> /v2/check -> buildOrderTx (Jupiter fetched directly) -> verifyV2 -> simulate
import { Connection, PublicKey } from '@solana/web3.js'
import { buildOrderTx, checkQuote, newSecret, orderMemo, sealAddress, verifyV2 } from '../lib/v2'
const [base, user, inMint, amount] = process.argv.slice(2)
const conn = new Connection(process.env.RPC!, 'confirmed')
const q = await (await fetch(`${base}/v2/quote?in=${inMint}&amount=${amount}&wallet=${user}`)).json()
if (!q.quoteId) { console.log('quote error', q); process.exit(1) }
console.log('quote', { lamports: q.lamports, xmrOut: q.xmrOut, swap: !!q.swapQuote })
console.log('checkQuote', checkQuote(q, { inputMint: inMint, amount: BigInt(amount) }) ?? 'ok', '| tampered:', checkQuote({ ...q, lamports: String(BigInt(q.lamports) + 1n) }, { inputMint: inMint, amount: BigInt(amount) }))
const ADDR = '82wez4jsocbZf9DAYmM5HsbKre6pnE5LuSCnbAwVJDTKKYEfuvKeacaTgRddrJvVSBB6PwisuYtNvZes37G2PVJ3EKWgJYX'
const sealed = sealAddress(ADDR), { hash } = newSecret(), memo = orderMemo(q.quoteId, hash, sealed)
const c = await (await fetch(`${base}/v2/check`, { method: 'POST', body: JSON.stringify({ quoteId: q.quoteId, sealed, secretHash: hash }) })).json()
console.log('check', c.ok, 'memo matches', c.memo === memo)
const u = new PublicKey(user)
const { tx, alts } = await buildOrderTx(conn, { user: u, lamports: BigInt(q.lamports), memo, swapQuote: q.swapQuote })
console.log('verifyV2', verifyV2(tx, alts, { user: u, lamports: BigInt(q.lamports), memo }) ?? 'ok', '| wrong amount:', verifyV2(tx, alts, { user: u, lamports: 1n, memo }))
console.log('tx bytes', tx.serialize().length, '(Phantom needs room: limit', 1232 - 150, ')')
const sim = await conn.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true })
console.log('simulation', sim.value.err ?? 'OK', sim.value.unitsConsumed, 'CU', '| address in tx:', Buffer.from(tx.serialize()).toString('latin1').includes(ADDR))
