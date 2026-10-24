import nacl from 'tweetnacl'
import { sha256 } from '@noble/hashes/sha256'
import { AddressLookupTableAccount, ComputeBudgetProgram, Connection, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import { ata } from './bridge'
import { ATA_PROGRAM, SOL_MINT, TOKEN_PROGRAM } from './constants'
import { base58Decode } from './monero'
import bs58 from 'bs58'

/*
  Nero v2 (private exit). Our solver pays real XMR from its own Monero wallet. The order is one Solana
  transaction: SOL (or a Jupiter swap into SOL) to the solver's deposit wallet, plus a memo that carries the
  Monero address sealed to the solver's key. The address is sealed here, in the browser, and never appears
  on Solana. The solver's deposit wallet and sealing key are pinned below, not fetched.
*/
export const SOLVER_DEPOSIT = new PublicKey('5GDP6viv4mK1XE2RBtdLoz3ct65YFjq6yfFoqXBi7bbk')
export const SOLVER_BOX_PUB = Uint8Array.from(atob('l0meX+p6q/5U+TC5qoqbTZLttsYxSrqy8EPjXZGyhTA='), (c) => c.charCodeAt(0))
const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
const JUP = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
const MAX_PRIORITY_LAMPORTS = 10_000_000n
// wallets add their own guard instruction before signing; a transaction with no room for it gets a scary warning
export const WALLET_ROOM = 150

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
const hex = (u: Uint8Array) => Array.from(u, (b) => b.toString(16).padStart(2, '0')).join('')

const cat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length } return out }
const unhex = (h: string) => Uint8Array.from(h.match(/../g) || [], (b) => parseInt(b, 16))

/** ephemeralPub(32) | box(address bytes) in base64, matching the solver's openAddress. The nonce is derived from the
 *  one-time ephemeral key, and the address travels as its raw bytes, to keep the memo small. */
export function sealAddress(address: string): string {
  const bin = base58Decode(address)
  if (!bin) throw new Error('not a Monero address')
  const eph = nacl.box.keyPair()
  const nonce = sha256(cat(eph.publicKey, SOLVER_BOX_PUB)).subarray(0, 24)
  return b64(cat(eph.publicKey, nacl.box(bin, nonce, SOLVER_BOX_PUB, eph.secretKey)))
}

/** The order secret stays in this browser; only its hash goes on-chain. It unlocks the payment proof. */
export function newSecret() {
  const s = nacl.randomBytes(32)
  return { secret: hex(s), hash: hex(sha256(s).subarray(0, 12)) }
}

/** r2:<base64(quoteId[8] | secretHash[12] | sealed)>: exactly what the solver's formatMemo produces */
export const orderMemo = (quoteId: string, hash: string, sealedB64: string) =>
  'r2:' + b64(cat(unhex(quoteId), unhex(hash), Uint8Array.from(atob(sealedB64), (c) => c.charCodeAt(0))))

/*
  The solver signs a short promise for every order with the deposit wallet's own key. It is checked here before the
  wallet is asked to sign anything: the right signer, the right amounts, the right destination, and the sealed address
  this browser made. A promise that does not check out stops the order.
*/
export type OrderPromise = { text: string; signature: string }
export function checkPromise(p: OrderPromise | undefined, want: { lamports: string; xmrOut: string; to: string; sealed: string }): string | null {
  if (!p || typeof p.text !== 'string' || typeof p.signature !== 'string') return 'the solver sent no signed promise'
  const lines = p.text.split('\n')
  if (lines[0] !== 'Nero order promise v1') return 'the promise is not in a format this page knows'
  const has = (l: string) => lines.includes(l)
  if (!has(`you send: ${want.lamports} lamports of SOL to ${want.to}`)) return 'the promise names a different amount or address'
  if (!lines.some((l) => l.startsWith(`you get: ${want.xmrOut} piconero `))) return 'the promise names a different XMR amount'
  if (!has(`paid to: the Monero address sealed in this order, sha256 ${hex(sha256(new TextEncoder().encode(want.sealed)))}`)) return 'the promise is for a different sealed address'
  if (!has(`signed by: ${SOLVER_DEPOSIT.toBase58()}`)) return 'the promise names a different signer'
  let sig: Uint8Array
  try { sig = bs58.decode(p.signature) } catch { return 'the promise signature is unreadable' }
  if (sig.length !== 64 || !nacl.sign.detached.verify(new TextEncoder().encode(p.text), sig, SOLVER_DEPOSIT.toBytes())) return 'the promise signature does not check out'
  return null
}

export type V2Order = { sig: string; secret: string; at: number; from: string; xmrOut: string; promise?: OrderPromise }
const STORE = 'nero.v2orders'
export const loadV2 = (): V2Order[] => { try { return JSON.parse(localStorage.getItem(STORE) || '[]') } catch { return [] } }
export const saveV2 = (o: V2Order) => { try { localStorage.setItem(STORE, JSON.stringify([o, ...loadV2().filter((x) => x.sig !== o.sig)].slice(0, 20))) } catch {} }

/*
  Check the built order before the wallet sees it:
    - fee payer is the user; only compute budget, system, token, associated token, Jupiter and memo programs
    - exactly one SOL transfer to the pinned solver deposit, of exactly the quoted lamports, from the user
    - any other system transfer only wraps SOL into the user's own wSOL account; token instructions limited to
      SyncNative and CloseAccount back to the user; account creation only for the user; a Jupiter swap must pay
      into the user's own wSOL account
    - exactly one memo, equal to the order we sealed
    - priority fee capped
*/
export function verifyV2(tx: VersionedTransaction, alts: AddressLookupTableAccount[], p: { user: PublicKey; lamports: bigint; memo: string }): string | null {
  const keys = tx.message.getAccountKeys({ addressLookupTableAccounts: alts })
  const key = (i: number) => keys.get(i)
  if (!key(0)?.equals(p.user)) return 'fee payer is not your wallet'
  const wsol = ata(p.user, SOL_MINT)
  let toSolver = 0, memos = 0, jup = 0, jupToWsol = false, cuLimit = 1_400_000n, cuPrice = 0n
  for (const ix of tx.message.compiledInstructions) {
    const pid = key(ix.programIdIndex)?.toBase58()
    const acc = (i: number) => key(ix.accountKeyIndexes[i])
    const d = ix.data
    if (pid === ComputeBudgetProgram.programId.toBase58()) {
      const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
      if (d[0] === 2 && d.length >= 5) cuLimit = BigInt(dv.getUint32(1, true))
      else if (d[0] === 3 && d.length >= 9) cuPrice = dv.getBigUint64(1, true)
      else return 'unexpected compute budget instruction'
      continue
    }
    if (pid === SystemProgram.programId.toBase58()) {
      const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
      if (d.length !== 12 || dv.getUint32(0, true) !== 2) return 'unexpected system instruction'
      const lamports = dv.getBigUint64(4, true)
      if (!acc(0)?.equals(p.user)) return 'a transfer is not from your wallet'
      if (acc(1)?.equals(SOLVER_DEPOSIT)) {
        if (lamports !== p.lamports) return 'the amount to the solver is not what you were quoted'
        toSolver++
      } else if (!acc(1)?.equals(wsol)) return 'a transfer goes somewhere unexpected'
      continue
    }
    if (pid === MEMO) {
      if (new TextDecoder().decode(d) !== p.memo) return 'the order memo was changed'
      memos++
      continue
    }
    if (pid === TOKEN_PROGRAM.toBase58() || pid === TOKEN_2022) {
      if (d[0] === 17) continue // SyncNative
      if (d[0] === 9 && acc(1)?.equals(p.user) && acc(2)?.equals(p.user)) continue // CloseAccount back to you
      return 'unexpected token instruction'
    }
    if (pid === ATA_PROGRAM.toBase58()) {
      if (!(d.length === 0 || d[0] === 0 || d[0] === 1) || !acc(0)?.equals(p.user) || !acc(2)?.equals(p.user)) return 'unexpected account creation'
      continue
    }
    if (pid === JUP) {
      jup++
      if (ix.accountKeyIndexes.some((i) => key(i)?.equals(wsol))) jupToWsol = true
      continue
    }
    return `unexpected program ${pid}`
  }
  if (toSolver !== 1) return 'the transaction must pay the solver exactly once'
  if (memos !== 1) return 'the transaction must carry exactly one order memo'
  if (jup > 0 && !jupToWsol) return 'the swap does not pay into your own SOL account'
  if ((cuLimit * cuPrice) / 1_000_000n > MAX_PRIORITY_LAMPORTS) return 'priority fee is too high'
  return null
}

/* ---------------- building the order in the browser ---------------- */

const JUP_API = 'https://lite-api.jup.ag/swap/v1'
type JupIx = { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string }
const toIx = (ix: JupIx) => new TransactionInstruction({
  programId: new PublicKey(ix.programId),
  keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
  data: Uint8Array.from(atob(ix.data), (c) => c.charCodeAt(0)) as any,
})

/** The solver's quote must match what you typed: same token, same amount, and (for a token) a Jupiter ExactIn
 *  quote into SOL whose guaranteed output is exactly the SOL the order sends. Returns a reason, or null. */
export function checkQuote(q: { lamports: string; swapQuote: any }, p: { inputMint: string; amount: bigint }): string | null {
  if (p.inputMint === SOL_MINT.toBase58()) return BigInt(q.lamports) === p.amount ? null : 'the quote is for a different amount'
  const s = q.swapQuote
  if (!s) return 'missing swap quote'
  if (s.inputMint !== p.inputMint || s.outputMint !== SOL_MINT.toBase58()) return 'the quote swaps a different token'
  if (s.swapMode !== 'ExactIn' || BigInt(s.inAmount) !== p.amount) return 'the quote is for a different amount'
  if (BigInt(s.otherAmountThreshold) !== BigInt(q.lamports)) return 'the quote does not match the order amount'
  if (s.platformFee && Number(s.platformFee.amount) > 0) return 'unexpected platform fee'
  return null
}

/** Build the order: [Jupiter swap into SOL, fetched from Jupiter here] + SOL to the solver + the sealed memo. */
export async function buildOrderTx(connection: Connection, p: { user: PublicKey; lamports: bigint; memo: string; swapQuote: any | null }) {
  const ixs: TransactionInstruction[] = []
  let alts: AddressLookupTableAccount[] = []
  if (p.swapQuote) {
    const r = await fetch(`${JUP_API}/swap-instructions`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quoteResponse: p.swapQuote, userPublicKey: p.user.toBase58(), wrapAndUnwrapSol: true }) })
    const j = await r.json()
    if (!r.ok || j.error) throw new Error('Jupiter could not build the swap. Try again.')
    alts = (await Promise.all((j.addressLookupTableAddresses as string[]).map((a) => connection.getAddressLookupTable(new PublicKey(a))))).map((x) => x.value).filter((v): v is AddressLookupTableAccount => !!v)
    ixs.push(...(j.setupInstructions as JupIx[]).map(toIx), toIx(j.swapInstruction), ...(j.cleanupInstruction ? [toIx(j.cleanupInstruction)] : []))
  }
  ixs.push(SystemProgram.transfer({ fromPubkey: p.user, toPubkey: SOLVER_DEPOSIT, lamports: p.lamports }))
  ixs.push(new TransactionInstruction({ programId: new PublicKey(MEMO), keys: [], data: new TextEncoder().encode(p.memo) as any }))
  const { blockhash } = await connection.getLatestBlockhash('confirmed')
  const msg = new TransactionMessage({
    payerKey: p.user, recentBlockhash: blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: p.swapQuote ? 700_000 : 200_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }), ...ixs],
  }).compileToV0Message(alts)
  const tx = new VersionedTransaction(msg)
  const bytes = tx.serialize().length
  if (bytes > 1232 - WALLET_ROOM) throw new Error('This token needs a longer route than fits in one private order. Try a smaller amount, or use the standard exit.')
  return { tx, alts, bytes }
}
