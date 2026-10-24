import { X_ASSETS } from './xchain'

// The page that says, route by route, what anyone can read about an exit. Its sections have fixed names
// (/what-is-public#standard), so posts and other pages can link one: never rename one, only add.
export const PUBLIC_PATH = '/what-is-public'

export const PUBLIC_TOC: [id: string, label: string][] = [
  ['private', 'Private exit, with a wallet'],
  ['send-sol', 'Private exit, Send SOL'],
  ['other-assets', 'Private exit, other assets'],
  ['standard', 'Standard exit'],
  ['enter', 'Enter, from Monero'],
  ['numbers', 'Our own numbers'],
  ['browser', 'This browser'],
  ['after', 'After the XMR lands'],
]

/** The other networks an exit can start from today, as a phrase: "Base, Ethereum, … or Avalanche". */
export function xNetworks(): string {
  const names = [...new Set(X_ASSETS.filter((a) => !a.float && a.kind !== 'sol').map((a) => a.chainName))]
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names.join('')
}
