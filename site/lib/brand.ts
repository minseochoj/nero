export const BRAND = {
  name: 'Nero',
  domain: process.env.NEXT_PUBLIC_SITE_DOMAIN || 'neroswap.app',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://www.neroswap.app',
  x: process.env.NEXT_PUBLIC_X_HANDLE || '',
  github: process.env.NEXT_PUBLIC_GITHUB_URL || 'https://github.com/neroswap/nero',
  // the commit this site was built from, so it can be compared with the public repository
  commit: process.env.NEXT_PUBLIC_COMMIT || 'dev',
  walletKey: 'nero.wallet',
  tagline: 'Private by default.',
  description: 'Any Solana token into real Monero, paid from our own Monero node. Your Monero address never appears on Solana. Open source, and every payment can be checked.',
}
