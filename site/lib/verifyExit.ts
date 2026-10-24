import { AddressLookupTableAccount, ComputeBudgetProgram, PublicKey, SystemProgram, VersionedTransaction } from '@solana/web3.js'
import { ata } from './bridge'
import { ATA_PROGRAM, BRIDGE_PROGRAM, MIN_WITHDRAW_PICO, SOL_MINT, TOKEN_PROGRAM, WXMR_MINT } from './constants'

/*
  The page re-checks every transaction the server builds before the wallet sees it, so a
  compromised server or swap API cannot slip in a second destination. Rules:
    - fee payer is the user; only compute budget, system, token, associated token, Jupiter, bridge
    - exactly one bridge instruction, the last one, fully decoded: request_withdrawal, the typed
      Monero address, exact_out = false, amount >= what the user was quoted, burning from the
      user's own wXMR account with the user as signer
    - token instructions limited to SyncNative and CloseAccount back to the user; system only
      wraps SOL into the user's own wSOL account; ATA creation only for the user
    - Jupiter's swap must touch the user's wXMR account; priority fee capped
*/
const JUP = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
const REQ = [251, 85, 121, 205, 56, 201, 12, 177]
const MAX_PRIORITY_LAMPORTS = 10_000_000n // 0.01 SOL

export function verifyExit(tx: VersionedTransaction, alts: AddressLookupTableAccount[], p: { user: PublicKey; xmrAddress: string; minAmount: bigint }): string | null {
  const keys = tx.message.getAccountKeys({ addressLookupTableAccounts: alts })
  const key = (i: number) => keys.get(i)
  if (!key(0)?.equals(p.user)) return 'fee payer is not your wallet'
  const ixs = tx.message.compiledInstructions
  const wxmrAta = ata(p.user, WXMR_MINT)
  const wsolAta = ata(p.user, SOL_MINT)
  let bridgeIx = -1
  let jupTouchesWxmr = false
  let cuLimit = 200_000n
  let cuPrice = 0n

  for (let n = 0; n < ixs.length; n++) {
    const ix = ixs[n]
    const pid = key(ix.programIdIndex)?.toBase58()
    const acc = (i: number) => key(ix.accountKeyIndexes[i])
    const d = ix.data
    if (pid === ComputeBudgetProgram.programId.toBase58()) {
      const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
      if (d[0] === 2 && d.length >= 5) cuLimit = BigInt(dv.getUint32(1, true))
      else if (d[0] === 3 && d.length >= 9) cuPrice = dv.getBigUint64(1, true)
      else return 'unexpected compute budget instruction'
    } else if (pid === SystemProgram.programId.toBase58()) {
      const isTransfer = d.length === 12 && d[0] === 2 && d[1] === 0 && d[2] === 0 && d[3] === 0
      if (!isTransfer || !acc(0)?.equals(p.user) || !acc(1)?.equals(wsolAta)) return 'unexpected SOL transfer'
    } else if (pid === TOKEN_PROGRAM.toBase58() || pid === TOKEN_2022) {
      if (d[0] === 17) continue // SyncNative
      if (d[0] === 9 && acc(1)?.equals(p.user) && acc(2)?.equals(p.user)) continue // CloseAccount back to you
      return 'unexpected token instruction'
    } else if (pid === ATA_PROGRAM.toBase58()) {
      if (!(d.length === 0 || d[0] === 0 || d[0] === 1) || !acc(0)?.equals(p.user) || !acc(2)?.equals(p.user)) return 'unexpected account creation'
    } else if (pid === JUP) {
      if (ix.accountKeyIndexes.some((i) => key(i)?.equals(wxmrAta))) jupTouchesWxmr = true
    } else if (pid === BRIDGE_PROGRAM.toBase58()) {
      if (bridgeIx !== -1) return 'more than one bridge instruction'
      bridgeIx = n
    } else {
      return `unexpected program ${pid}`
    }
  }

  if (bridgeIx !== ixs.length - 1) return 'the bridge request is missing or not last'
  const b = ixs[bridgeIx]
  const d = b.data
  if (d.length < 29 || !REQ.every((x, i) => d[i] === x)) return 'not a bridge withdrawal'
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength)
  const amount = dv.getBigUint64(16, true)
  const len = dv.getUint32(24, true)
  if (d.length !== 28 + len + 1) return 'malformed bridge request'
  if (new TextDecoder().decode(d.slice(28, 28 + len)) !== p.xmrAddress) return 'Monero address in the transaction does not match'
  if (d[28 + len] !== 0) return 'unexpected exact-out flag'
  if (amount < p.minAmount || amount < MIN_WITHDRAW_PICO) return 'the transaction sends less XMR than quoted'
  if (!key(b.accountKeyIndexes[3])?.equals(wxmrAta)) return 'the bridge request does not burn from your wXMR account'
  if (!key(b.accountKeyIndexes[6])?.equals(p.user)) return 'the bridge request is not signed by your wallet'
  if (!jupTouchesWxmr) return 'the swap does not pay into your wXMR account'
  if ((cuPrice * cuLimit) / 1_000_000n > MAX_PRIORITY_LAMPORTS) return 'priority fee too high'
  return null
}
