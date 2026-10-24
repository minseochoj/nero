// Tokens you can exit from. Any SPL mint works through /api/exit; these are the shortcuts.
// Plain strings on purpose: pages that only show a quote import this without pulling in the Solana library.
export const EXIT_TOKENS = [
  { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', decimals: 9, icon: '/img/sol.webp' },
  { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, icon: '/img/usdc.webp' },
  { symbol: 'USDT', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, icon: '/img/usdt.svg' },
] as const
