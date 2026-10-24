// Refill the Monero float from the SOL the solver has earned: SOL -> wXMR (Jupiter), then a bridge withdrawal of the
// whole wXMR balance to the solver's own Monero address. Two separate, balance-bounded steps, so a retry can never
// spend more than is there. A reverted bridge request simply returns the wXMR, and the next run tries again.
// Batched and decoupled from orders: refills cannot be matched to any one user's exit.
import { PublicKey } from '@solana/web3.js'
import { buildTx, simulate, sendSafe, tokenBalance } from './lib/chain.js'
import { quote as jupQuote, swapInstructions, toIx } from './lib/jup.js'
import { ata, WXMR_MINT, withdrawalStatePda, decodeLastNonce, nextNonce, requestWithdrawalIx } from './lib/bridge.js'

const SOL = 'So11111111111111111111111111111111111111112'
const BRIDGE_MIN = 105_000_000_000n // 0.105 XMR: the bridge's 0.1 minimum plus headroom

export async function rebalance({ conn, depositKp, wallet, S, C, store, save, log, live }) {
  const me = depositKp.publicKey
  // Spend only SOL we earned (deposits we paid out in XMR), never SOL that may have to go back:
  // queued or unresolved refunds, held deposits without an order, anything stuck, plus a gas reserve.
  let owed = 0n
  for (const o of Object.values(S.orders)) if (['refund_pending', 'refunding', 'stuck', 'held'].includes(o.status)) owed += BigInt(o.lamportsIn)
  const bal = BigInt(await conn.getBalance(me, 'confirmed'))
  const earned = BigInt(S.earnedLamports || '0') - BigInt(S.rebalancedLamports || '0')
  const room = bal - owed - C.gasReserve
  const spend = earned < room ? earned : room
  const min = BigInt(process.env.REBAL_MIN_LAMPORTS || 1_000_000_000)

  if (S.rebalanceHalted) { log('rebalance halted:', S.rebalanceHalted); return }
  if (spend >= min) {
    const q = await jupQuote({ inputMint: SOL, outputMint: WXMR_MINT.toBase58(), amount: spend, slippageBps: 100 })
    const ji = await swapInstructions(q, me.toBase58())
    const alts = (await Promise.all(ji.addressLookupTableAddresses.map((a) => conn.getAddressLookupTable(new PublicKey(a))))).map((r) => r.value).filter(Boolean)
    const built = await buildTx(conn, me, [...ji.setupInstructions.map(toIx), toIx(ji.swapInstruction), ...(ji.cleanupInstruction ? [toIx(ji.cleanupInstruction)] : [])], [depositKp], { units: 600_000, alts })
    const sim = await simulate(conn, built.tx)
    if (!sim.ok) log('rebalance swap simulation failed', JSON.stringify(sim.err))
    else if (!live) log(`[dry] rebalance: would swap ${spend} lamports to >= ${q.otherAmountThreshold} pico wXMR`)
    else {
      const r = await sendSafe(conn, built)
      store.append('rebalance.jsonl', { step: 'swap', lamports: String(spend), minOut: q.otherAmountThreshold, status: r.status, sig: r.sig })
      log('rebalance swap', r.status, r.sig)
      if (r.status === 'confirmed') { S.rebalancedLamports = String(BigInt(S.rebalancedLamports || '0') + spend); save() }
      else if (r.status !== 'not_landed' && r.status !== 'failed') { S.rebalanceHalted = `swap outcome unknown: ${r.sig}`; save() } // stop refills until checked
    }
  }

  const wx = await tokenBalance(conn, ata(me)).catch(() => 0n)
  if (wx >= BRIDGE_MIN) {
    const addr = (await wallet.call('get_address', { account_index: 0 })).address
    const st = await conn.getAccountInfo(withdrawalStatePda(me))
    const nonce = nextNonce(st ? decodeLastNonce(st.data) : null)
    const built = await buildTx(conn, me, [requestWithdrawalIx(me, nonce, wx, addr, false)], [depositKp], { units: 90_000 })
    const sim = await simulate(conn, built.tx)
    if (!sim.ok) log('rebalance withdrawal simulation failed', JSON.stringify(sim.err))
    else if (!live) log(`[dry] rebalance: would bridge ${wx} pico wXMR to our Monero wallet`)
    else { const r = await sendSafe(conn, built); store.append('rebalance.jsonl', { step: 'bridge', pico: String(wx), nonce: String(nonce), status: r.status, sig: r.sig }); log('rebalance bridge', r.status, r.sig) }
  }
}
