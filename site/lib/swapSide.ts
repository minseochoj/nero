import { PUBLIC_PATH } from './whatIsPublic'

/*
  The text beside the swap form. It follows what the form is showing: the tab (private exit, standard exit, enter)
  and, inside the private exit, how the funds are sent (wallet, Send SOL, other assets). Each view gets its own
  heading, three steps and facts, so the side never says "you sign once" next to a form where nothing is signed.

  Text only. The figures here are the ones the forms, Help and the Paper state; change them together.
*/
export type SideView = 'wallet' | 'send' | 'x' | 'exit' | 'enter'
export type SideText = {
  heading: string
  lead: string
  // hot: a step that happens on Solana or on our side (orange dot); the last step is Monero's own
  steps: { title: string; text: string; hot?: true }[]
  facts: [string, string][]
}

export const SIDE_VIEWS: SideView[] = ['wallet', 'send', 'x', 'exit', 'enter']

const MONERO_TAKES_OVER = { title: 'Monero takes over', text: 'After it lands, senders, receivers and amounts are hidden by default.' }

const TEXT: Record<SideView, SideText> = {
  wallet: {
    heading: 'Exit to Monero.',
    lead: 'Any Solana token to real XMR at your own address, in one signature. Your Monero address never appears on Solana.',
    steps: [
      { title: 'You sign once', text: 'Your token is swapped and sent in a single transaction. Your Monero address is sealed in your browser first.', hot: true },
      { title: 'Our solver pays XMR', text: 'From our own Monero wallet, seconds after your deposit is final. If it can’t, your funds come back.', hot: true },
      MONERO_TAKES_OVER,
    ],
    facts: [
      ['Any token', 'SOL, stablecoins, pump.fun coins: search by name or paste the token address'],
      ['Minimum', '0.01 XMR private · 0.1 XMR standard (bridge rule)'],
      ['Fees', 'Private: 0.6%, already in the quote. Standard: 0.3% + 0.1% bridge'],
      ['Still public', 'That your wallet sent funds to Nero, and how much. The standard exit also names your Monero address'],
      ['Bigger amounts', 'When an order is more than the private exit can cover, the standard exit takes it'],
    ],
  },
  send: {
    heading: 'Exit without a wallet.',
    lead: 'Send SOL from any wallet or exchange to a one-time address and receive real XMR. Nothing to connect, nothing to sign on this site.',
    steps: [
      { title: 'You get a one-time address', text: 'Type the amount, your Monero address and a Solana refund address. The rate is locked for 15 minutes.', hot: true },
      { title: 'You send SOL', text: 'Exactly the amount shown, in one transfer. Our solver pays XMR from its own Monero wallet once the deposit is final.', hot: true },
      MONERO_TAKES_OVER,
    ],
    facts: [
      ['Asset', 'SOL only, on Solana. For USDC, USDT or another chain, choose Other assets'],
      ['Fee', '0.9%, already in the amount'],
      ['Timer', '15 minutes from the moment the address is made'],
      ['Refund address', 'A Solana wallet you control, not an exchange deposit address. Too little, or anything after the timer, goes back there'],
      ['Still public', 'The transfer to the one-time address. Not where the XMR went'],
    ],
  },
  x: {
    heading: 'Exit from other assets.',
    lead: 'USDC or USDT on Solana, or ETH, USDC and other coins on six more networks, to real XMR. Nothing to connect, nothing to sign on this site.',
    steps: [
      { title: 'You get a one-time address', text: 'Pick the asset and its network, then give your Monero address and a refund address on that same network.', hot: true },
      { title: 'You send on that network', text: 'A route delivers SOL to our solver, which pays XMR from its own Monero wallet. The route never sees your Monero address.', hot: true },
      MONERO_TAKES_OVER,
    ],
    facts: [
      ['Networks', 'Solana (USDC, USDT), Base, Ethereum, Arbitrum, Optimism, Polygon and Avalanche'],
      ['Per order', 'Up to 0.2 XMR for now'],
      ['Fee', '0.9% ours, plus the route’s own cost. Both are already in the amount'],
      ['Timer', 'About 13 minutes to send. A deposit that arrives late is paid at the rate of that moment'],
      ['Wrong network', 'Send only on the network shown: the wrong one can lose funds'],
      ['Still public', 'Your transfer on that network and the SOL that reaches Nero. Not where the XMR went'],
    ],
  },
  exit: {
    heading: 'Exit through the bridge.',
    lead: 'For amounts bigger than the private exit can cover. Any Solana token to real XMR in one signature, with your Monero address written on Solana.',
    steps: [
      { title: 'You sign once', text: 'Your token is swapped into wXMR and handed to the bridge in a single transaction. If any part fails, nothing moves.', hot: true },
      { title: 'The bridge pays XMR', text: 'The wXMR bridge sends real XMR to your address, usually in under a minute.', hot: true },
      MONERO_TAKES_OVER,
    ],
    facts: [
      ['Any token', 'Anything with a route into wXMR: search by name or paste the token address'],
      ['Minimum', '0.1 XMR (bridge rule). No upper limit from us'],
      ['Fees', '0.3% to Nero, plus the bridge’s 0.1%'],
      ['Still public', 'Your wallet, what you swapped and how much, your Monero address, and the bridge’s Monero tx and tx key'],
      ['More private', 'The private exit keeps your Monero address off Solana'],
    ],
  },
  enter: {
    heading: 'Enter from Monero.',
    lead: 'Send XMR to a deposit address made for your wallet and receive wXMR on Solana, ready to swap into any token.',
    steps: [
      { title: 'You get a deposit address', text: 'Connect a wallet and sign once. The bridge gives it a Monero address of its own.', hot: true },
      { title: 'You send XMR', text: 'From any Monero wallet. The bridge waits for Monero confirmations, about 20 minutes.', hot: true },
      { title: 'wXMR arrives on Solana', text: 'In the wallet you connected. Swap it for SOL or any other token from there.' },
    ],
    facts: [
      ['Minimum', '0.1 XMR per deposit'],
      ['Bridge fee in', '0%'],
      ['Arrives as', 'wXMR, a token backed by XMR held by the bridge'],
      ['Address', 'Made for the wallet that asked for it, and only for that wallet'],
      ['Still public', 'The deposit address is recorded on Solana next to your wallet: anyone can see that this wallet deposits from Monero, not where the XMR came from'],
    ],
  },
}

/** What the side shows for a tab and, inside the private exit, the way of sending. */
export function sideView(tab: 'private' | 'exit' | 'enter', mode: 'wallet' | 'send' | 'x'): SideView {
  return tab === 'private' ? mode : tab
}

export const sideText = (view: SideView): SideText => TEXT[view]

// The fact every view carries; the side links it to the section of /what-is-public that sets the same route out in full.
export const STILL_PUBLIC = 'Still public'
export const PUBLIC_LINE = 'Everything this route shows'
const PUBLIC_SECTION: Record<SideView, string> = { wallet: 'private', send: 'send-sol', x: 'other-assets', exit: 'standard', enter: 'enter' }

/** The section of the What is public page that matches a view, for example /what-is-public#send-sol. */
export const sidePublicLink = (view: SideView): string => `${PUBLIC_PATH}#${PUBLIC_SECTION[view]}`
