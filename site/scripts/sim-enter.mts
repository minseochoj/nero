// Simulation only: open a bridge deposit account for a public wallet that has none. Nothing is signed or sent.
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { createAtaIdempotentIx, createDepositAccountIx, depositPda } from '../lib/bridge'
import { serverConnection } from '../lib/server/rpc'
const conn = serverConnection()
const user = new PublicKey(process.argv[2] || '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9')
console.log('deposit account exists already?', !!(await conn.getAccountInfo(depositPda(user))))
const { blockhash } = await conn.getLatestBlockhash()
const tx = new VersionedTransaction(new TransactionMessage({ payerKey: user, recentBlockhash: blockhash, instructions: [createAtaIdempotentIx(user, user), createDepositAccountIx(user)] }).compileToV0Message())
const r = await conn.simulateTransaction(tx, { sigVerify: false })
console.log('enter sim:', r.value.err || 'OK', r.value.unitsConsumed, (r.value.logs || []).filter((l) => /Instruction|success|failed|Error/.test(l)).slice(-5))
