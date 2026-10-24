import { PublicKey } from '@solana/web3.js'

/*
  Every address Nero touches. The wXMR values were read from chain and
  from the bridge's published IDL on 2026-10-08.
*/

// wXMR: XMR on Solana, 12 decimals (piconero), minted 1:1 by the wxmr.io bridge
export const WXMR_MINT = new PublicKey('WXMRyRZhsa19ety5erZhHg4N3xj3EVN92u94422teJp')
export const WXMR_DECIMALS = 12
export const PICONERO = 1_000_000_000_000n

// The wxmr.io bridge program and its single operator key (upgrade authority + relayer)
export const BRIDGE_PROGRAM = new PublicKey('EzBkC8P5wxab9kwrtV5hRdynHAfB5w3UPcPXNgMseVA8')
export const BRIDGE_AUTHORITY = new PublicKey('Ds4prSZNwyxTz4PZmHXoHDXFzLZ1c8MkfhUwGtqvAvpK')

// On-chain minimums (MIN_XMR_WITHDRAWAL / MIN_XMR_DEPOSIT in the bridge program)
export const MIN_WITHDRAW_PICO = 100_000_000_000n // 0.1 XMR
export const MIN_DEPOSIT_PICO = 100_000_000_000n // 0.1 XMR
// The bridge owner may cancel a request that is still Pending after five minutes
export const CANCEL_DELAY_S = 300

export const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112')
export const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
export const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
export const ATA_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')

// Nero's fee on the standard exit, taken by Jupiter in wXMR. It pays for the node and the servers.
// It is only charged once the fee account exists (lib/server/exit.ts), and the quote always shows it.
export const PLATFORM_FEE_BPS = 30

export { EXIT_TOKENS } from './tokens'
