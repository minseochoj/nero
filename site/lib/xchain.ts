/*
  Exits from other chains. A route provider takes the asset on its own chain and delivers SOL to a one-time Solana
  address of our solver; the solver then pays XMR exactly as it does for a no-wallet order. The Monero address is
  sealed in the browser and goes only to our solver: the route provider never sees it.

  This file is shared by the server routes and the page. It holds the list of assets we offer (fast chains first)
  and the address checks. Decimals, symbols and prices are read live from the route provider, never hard-coded.
*/
import { keccak_256 } from '@noble/hashes/sha3'

export type XKind = 'evm' | 'tron' | 'btc' | 'zec' | 'ltc' | 'doge' | 'sol'
// float: the chain is too slow to promise a 15-minute window, so no rate is locked: the XMR is priced when the funds arrive
export type XAsset = { id: string; chain: string; chainName: string; symbol: string; kind: XKind; float?: true }
export type XAssetLive = XAsset & { decimals: number; price: number }

// BNB Chain and Tron are left out for now: the route's own minimum there is above our per-order limit.
export const X_ASSETS: XAsset[] = [
  // stablecoins on Solana itself: the same route turns them into SOL for the order, so an exchange withdrawal in USDC or USDT works too
  { id: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', chain: 'sol', chainName: 'Solana', symbol: 'USDC', kind: 'sol' },
  { id: 'nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near', chain: 'sol', chainName: 'Solana', symbol: 'USDT', kind: 'sol' },
  { id: 'nep141:base.omft.near', chain: 'base', chainName: 'Base', symbol: 'ETH', kind: 'evm' },
  { id: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', chain: 'base', chainName: 'Base', symbol: 'USDC', kind: 'evm' },
  { id: 'nep141:eth.omft.near', chain: 'eth', chainName: 'Ethereum', symbol: 'ETH', kind: 'evm' },
  { id: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near', chain: 'eth', chainName: 'Ethereum', symbol: 'USDC', kind: 'evm' },
  { id: 'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near', chain: 'eth', chainName: 'Ethereum', symbol: 'USDT', kind: 'evm' },
  { id: 'nep141:arb.omft.near', chain: 'arb', chainName: 'Arbitrum', symbol: 'ETH', kind: 'evm' },
  { id: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near', chain: 'arb', chainName: 'Arbitrum', symbol: 'USDC', kind: 'evm' },
  { id: 'nep245:v2_1.omni.hot.tg:10_11111111111111111111', chain: 'op', chainName: 'Optimism', symbol: 'ETH', kind: 'evm' },
  { id: 'nep245:v2_1.omni.hot.tg:10_A2ewyUyDp6qsue1jqZsGypkCxRJ', chain: 'op', chainName: 'Optimism', symbol: 'USDC', kind: 'evm' },
  { id: 'nep245:v2_1.omni.hot.tg:137_11111111111111111111', chain: 'pol', chainName: 'Polygon', symbol: 'POL', kind: 'evm' },
  { id: 'nep245:v2_1.omni.hot.tg:137_qiStmoQJDQPTebaPjgx5VBxZv6L', chain: 'pol', chainName: 'Polygon', symbol: 'USDC', kind: 'evm' },
  { id: 'nep245:v2_1.omni.hot.tg:43114_11111111111111111111', chain: 'avax', chainName: 'Avalanche', symbol: 'AVAX', kind: 'evm' },
  { id: 'nep245:v2_1.omni.hot.tg:43114_3atVJH3r5c4GqiSYmg9fECvjc47o', chain: 'avax', chainName: 'Avalanche', symbol: 'USDC', kind: 'evm' },
  { id: 'nep141:btc.omft.near', chain: 'btc', chainName: 'Bitcoin', symbol: 'BTC', kind: 'btc', float: true },
  { id: 'nep141:zec.omft.near', chain: 'zec', chainName: 'Zcash', symbol: 'ZEC', kind: 'zec', float: true },
  { id: 'nep141:ltc.omft.near', chain: 'ltc', chainName: 'Litecoin', symbol: 'LTC', kind: 'ltc', float: true },
  { id: 'nep141:doge.omft.near', chain: 'doge', chainName: 'Dogecoin', symbol: 'DOGE', kind: 'doge', float: true },
]

export const xAsset = (id: string) => X_ASSETS.find((a) => a.id === id) || null

/** EIP-55: the capital letters of an EVM address are a checksum of the address itself. */
function evmChecksum(lower40: string): string {
  const hash = keccak_256(new TextEncoder().encode(lower40))
  let out = ''
  for (let i = 0; i < 40; i++) out += ((hash[i >> 1] >> (i % 2 ? 0 : 4)) & 0xf) >= 8 ? lower40[i].toUpperCase() : lower40[i]
  return out
}

/** A refund address on the origin chain, in the form that chain uses. An EVM address written with capitals must pass
 *  its checksum, so a mistyped character is caught; it is then sent lower-case. */
export function checkRefund(kind: XKind, address: string): { ok: true; value: string } | { ok: false; reason: string } {
  const a = address.trim()
  if (kind === 'evm') {
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return { ok: false, reason: 'Enter an address that starts with 0x and has 40 more characters.' }
    const body = a.slice(2), lower = body.toLowerCase()
    if (body !== lower && body !== body.toUpperCase() && body !== evmChecksum(lower)) return { ok: false, reason: 'This address has a typo: its capital letters do not match. Copy it again from your wallet.' }
    return { ok: true, value: `0x${lower}` }
  }
  const B58 = '[1-9A-HJ-NP-Za-km-z]', B32 = '[ac-hj-np-z02-9]'
  const rule: Record<Exclude<XKind, 'evm'>, [RegExp, string]> = {
    tron: [new RegExp(`^T${B58}{33}$`), 'Enter a Tron address (it starts with T).'],
    btc: [new RegExp(`^(bc1${B32}{11,71}|[13]${B58}{25,34})$`), 'Enter a Bitcoin address (it starts with bc1, 1 or 3).'],
    zec: [new RegExp(`^t[13]${B58}{33}$`), 'Enter a transparent Zcash address (it starts with t1 or t3). Shielded addresses cannot receive a refund from the route.'],
    ltc: [new RegExp(`^(ltc1${B32}{11,71}|[LM3]${B58}{26,33})$`), 'Enter a Litecoin address (it starts with ltc1, L or M).'],
    doge: [new RegExp(`^[DA9]${B58}{33}$`), 'Enter a Dogecoin address (it starts with D).'],
    sol: [new RegExp(`^${B58}{32,44}$`), 'Enter a Solana wallet address you control (not an exchange deposit address).'],
  }
  const [re, reason] = rule[kind]
  const v = /^(bc1|ltc1)/i.test(a) ? a.toLowerCase() : a // bech32 is case-insensitive; the other forms are not
  return re.test(v) ? { ok: true, value: v } : { ok: false, reason }
}

/** What a route status means for the person waiting. */
export type XStage = 'waiting' | 'crossing' | 'arrived' | 'refunded' | 'failed'
export function routeStage(status: string | undefined): XStage {
  switch (status) {
    case 'SUCCESS': return 'arrived'
    case 'PROCESSING': case 'KNOWN_DEPOSIT_TX': return 'crossing'
    case 'REFUNDED': return 'refunded'
    case 'FAILED': return 'failed'
    default: return 'waiting' // PENDING_DEPOSIT, INCOMPLETE_DEPOSIT (more can still arrive before the deadline), unknown
  }
}

/** Smallest units -> a plain decimal string without trailing zeros. */
export function unitsToDecimal(units: string | bigint, decimals: number): string {
  const v = BigInt(units), base = 10n ** BigInt(decimals)
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${v / base}${frac ? `.${frac}` : ''}`
}

/** The amount to ask for, rounded UP to a precision every wallet and exchange can type (never below what the route needs). */
export function roundUpUnits(units: string | bigint, decimals: number): bigint {
  const keep = decimals >= 12 ? 6 : Math.min(decimals, 2)
  const step = 10n ** BigInt(decimals - keep)
  const v = BigInt(units)
  return ((v + step - 1n) / step) * step
}
