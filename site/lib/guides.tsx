import Link from 'next/link'
import { helpLink } from '@/lib/helpAnchors'
import { EXIT_TOKENS } from '@/lib/tokens'
import { BRAND } from '@/lib/brand'
import { PLATFORM_FEE_BPS } from '@/lib/constants'

// The guides under /guides/. Plain how-to pages for people arriving from search; every fact here is also in the Paper or Help.
// Add a guide here and it gets its page, its share card, its line on /guides and its sitemap entry.

export type GuideQuoteKind = 'sol' | 'usdc' | 'usdt' | 'pump'

export type Guide = {
  slug: string
  title: string // the page heading
  metaTitle: string // browser tab and search result
  description: string
  card: string // the big line on the share card
  intro: React.ReactNode
  quote?: GuideQuoteKind // the live "right now" line; left out on guides that are not about one exit
  cta: { href: string; label: string }
  steps: [heading: string, body: React.ReactNode][]
  notes: [heading: string, body: React.ReactNode][]
}

const [SOL, USDC, USDT] = EXIT_TOKENS

const wallet = (
  <>You need a Monero address to be paid at. Cake Wallet (phone) and Feather Wallet (desktop) are widely used: create a wallet, write down its recovery phrase, and copy a receive address. A fresh subaddress, which starts with 8, for each exit is best.</>
)
const arrives = (
  <>Your Monero wallet shows the payment within a minute or two and can spend it after 10 confirmations, about 20 minutes. The order page keeps the Monero transaction and its key as your proof of payment, only in the browser that made the order, so keep that link.</>
)
const stillPublic = (
  <>That your Solana wallet sent funds to Nero, and how much. Solana is a public ledger and nothing changes that. What the private exit keeps off Solana is your Monero address: it is sealed in your browser before the order is sent. Once the XMR lands, Monero hides senders, receivers and amounts by default.</>
)
const refund = (
  <>If an order cannot be paid as quoted (the quote ran out before your transaction landed, or there was not enough XMR on hand), your funds are sent back, minus the network fee. The <Link className="link" href={helpLink('refunded')}>Help page</Link> covers each case.</>
)

export const GUIDES: Guide[] = [
  {
    slug: 'sol-to-xmr',
    title: 'How to swap SOL to XMR.',
    metaTitle: 'How to swap SOL to XMR (Solana to Monero)',
    description: 'Turn SOL into real Monero at your own address: from a connected wallet in one signature, or from any wallet or exchange with no connection at all.',
    card: 'SOL to XMR.',
    intro: <>SOL goes in on Solana, real XMR arrives at your own Monero address. You can sign once from a connected wallet, or send SOL from any wallet or exchange without connecting anything.</>,
    quote: 'sol',
    cta: { href: `/swap?in=${SOL.mint}&amount=1`, label: 'Swap SOL to XMR' },
    steps: [
      ['Get a Monero address', wallet],
      ['Open the swap page', <>Go to <Link className="link" href={`/swap?in=${SOL.mint}&amount=1`}>Swap</Link>. It opens on the Private exit with SOL selected. Type how much SOL you want to send and paste your Monero address. The page checks the address as you type.</>],
      ['Pick how to send', <>With <b>Wallet</b> you connect and sign one transaction; the quote already includes the 0.6% fee. Or choose <b>Send SOL</b>, marked “No connection”: you get a one-time deposit address with a QR code and a 15-minute timer, and send SOL to it from any wallet or exchange. That route costs 0.9% and asks for a Solana refund address you control, because the sender of an exchange withdrawal is not you.</>],
      ['Wait for the payment', <>Nero waits until your deposit is final on Solana, about 15 seconds, then its solver pays XMR from its own Monero wallet, usually within seconds. {arrives}</>],
    ],
    notes: [
      ['Limits', <>The private exit starts at 0.01 XMR and has a per-order maximum that grows with the solver&apos;s reserve; the swap page shows what it can cover right now. For more than that, the page offers the Standard exit, which runs through the wXMR bridge, starts at 0.1 XMR, costs {PLATFORM_FEE_BPS / 100}% plus the bridge&apos;s 0.1%, and does put your Monero address on Solana.</>],
      ['What stays public', stillPublic],
      ['If something goes wrong', refund],
    ],
  },
  {
    slug: 'usdc-to-xmr',
    title: 'How to swap USDC to XMR.',
    metaTitle: 'How to swap USDC to XMR (Solana USDC to Monero)',
    description: 'Turn USDC on Solana into real Monero at your own address in one signature. The same steps work for USDT.',
    card: 'USDC to XMR.',
    intro: <>USDC on Solana goes in, real XMR arrives at your own Monero address, in one transaction you sign yourself. The same steps work for USDT.</>,
    quote: 'usdc',
    cta: { href: `/swap?in=${USDC.mint}&amount=100`, label: 'Swap USDC to XMR' },
    steps: [
      ['Get a Monero address', wallet],
      ['Open the swap page', <>Go to <Link className="link" href={`/swap?in=${USDC.mint}&amount=100`}>Swap</Link>. It opens on the Private exit with USDC selected. Type the amount and paste your Monero address.</>],
      ['Connect and sign once', <>Connect the Solana wallet that holds the USDC. You get a quote in XMR with the 0.6% fee already in it, the rate, and how long the quote is held. One transaction swaps your USDC and sends the order; the page checks that transaction before your wallet is asked to sign it. Keep a little SOL in the wallet for the network fee.</>],
      ['Wait for the payment', <>Once your transaction is final on Solana, about 15 seconds, the solver pays XMR from its own Monero wallet, usually within seconds. {arrives}</>],
    ],
    notes: [
      ['No wallet connection?', <>The no-connect route takes SOL only for now. If your USDC sits on an exchange, withdraw SOL instead and follow the <Link className="link" href="/guides/exchange-to-xmr">exchange guide</Link>.</>],
      ['Limits', <>The private exit starts at 0.01 XMR and has a per-order maximum; the swap page shows what it can cover right now. Above that, the Standard exit takes over: through the wXMR bridge, from 0.1 XMR, {PLATFORM_FEE_BPS / 100}% plus the bridge&apos;s 0.1%, and it puts your Monero address on Solana.</>],
      ['What stays public', stillPublic],
      ['If something goes wrong', refund],
    ],
  },
  {
    slug: 'usdt-to-xmr',
    title: 'How to swap USDT to XMR.',
    metaTitle: 'How to swap USDT to XMR (Solana USDT to Monero)',
    description: 'Turn USDT on Solana into real Monero at your own address in one signature, and what to do if your USDT is on another network or an exchange.',
    card: 'USDT to XMR.',
    intro: <>USDT on Solana goes in, real XMR arrives at your own Monero address, in one transaction you sign yourself. It has to be USDT on the Solana network; USDT on Tron or Ethereum is a different token that Nero cannot take.</>,
    quote: 'usdt',
    cta: { href: `/swap?in=${USDT.mint}&amount=100`, label: 'Swap USDT to XMR' },
    steps: [
      ['Get a Monero address', wallet],
      ['Open the swap page', <>Go to <Link className="link" href={`/swap?in=${USDT.mint}&amount=100`}>Swap</Link>. It opens on the Private exit with USDT selected. Type the amount and paste your Monero address.</>],
      ['Connect and sign once', <>Connect the Solana wallet that holds the USDT. You get a quote in XMR with the 0.6% fee already in it, the rate, and how long the quote is held. One transaction swaps your USDT and sends the order; the page checks that transaction before your wallet is asked to sign it. Keep a little SOL in the wallet for the network fee.</>],
      ['Wait for the payment', <>Once your transaction is final on Solana, about 15 seconds, the solver pays XMR from its own Monero wallet, usually within seconds. {arrives}</>],
    ],
    notes: [
      ['USDT on another network or an exchange?', <>If your USDT is on an exchange, the simplest way is to buy SOL there and withdraw it straight to a one-time deposit address: the <Link className="link" href="/guides/exchange-to-xmr">exchange guide</Link> walks through it. Or withdraw the USDT to your own Solana wallet, choosing Solana as the network, and follow the steps above.</>],
      ['Limits', <>The private exit starts at 0.01 XMR and has a per-order maximum; the swap page shows what it can cover right now. Above that, the Standard exit takes over: through the wXMR bridge, from 0.1 XMR, {PLATFORM_FEE_BPS / 100}% plus the bridge&apos;s 0.1%, and it puts your Monero address on Solana.</>],
      ['What stays public', stillPublic],
      ['If something goes wrong', refund],
    ],
  },
  {
    slug: 'exchange-to-xmr',
    title: 'How to withdraw from an exchange to Monero without connecting a wallet.',
    metaTitle: 'Exchange withdrawal to Monero (XMR) without connecting a wallet',
    description: 'Withdraw SOL from any exchange to a one-time deposit address and receive real Monero at your own address. No wallet connection and no signature on the site.',
    card: 'Exchange to XMR.',
    intro: <>Many exchanges no longer list Monero. You can still get there: withdraw SOL from the exchange to a one-time deposit address, and real XMR arrives at your own Monero address. You connect nothing and sign nothing on this site.</>,
    quote: 'sol',
    cta: { href: `/swap?in=${SOL.mint}&amount=1`, label: 'Open the swap page' },
    steps: [
      ['Get two addresses ready', <>{wallet} You also need a Solana address you control, for refunds. It cannot be the exchange&apos;s deposit address: a refund sent there may never be credited to you. Any Solana wallet app gives you one.</>],
      ['Check the exchange first', <>Have SOL in your exchange account and look at its withdrawal screen: note the withdrawal fee, and whether the amount you type is what is sent or what arrives. If the exchange holds withdrawals for review, wait until it lets them through before you make an order, because the order is held for 15 minutes.</>],
      ['Make the order', <>Open <Link className="link" href={`/swap?in=${SOL.mint}&amount=1`}>Swap</Link> and, in the Private exit, choose <b>Send SOL</b>, marked “No connection”. Type the SOL amount, paste your Monero address and your Solana refund address, and tap <b>Get deposit address</b>. You get a one-time address, a QR code, the exact amount, the XMR you will receive and a 15-minute timer. The 0.9% fee is already in that figure.</>],
      ['Withdraw from the exchange', <>Withdraw SOL on the Solana network to the one-time address, in one transfer, so that the amount that <b>arrives</b> is the amount on the order. If the exchange takes its fee out of what you type, add the fee on top. Keep the order page open, or keep its link.</>],
      ['Wait for the payment', <>When the deposit is final on Solana, about 15 seconds after the exchange sends it, the solver pays XMR from its own Monero wallet, usually within seconds. {arrives}</>],
    ],
    notes: [
      ['If the amount or the timing is off', <>Less than the amount, or anything that arrives after the timer: it is sent back to your refund address once the timer ends, minus the network fee. More than the amount: the order is paid and the extra is sent back. Do not send a second withdrawal to fix a first one; make a new order.</>],
      ['Limits', <>This route takes SOL only for now, starts at 0.01 XMR and has a per-order maximum; the swap page shows what it can cover right now. For more than that, make several orders, or withdraw to your own Solana wallet and use the Standard exit described in the <Link className="link" href="/guides/sol-to-xmr">SOL to XMR guide</Link>.</>],
      ['What stays public', <>The exchange knows you withdrew SOL to an address, and Solana shows that transfer to the one-time address and its sweep into Nero. Neither shows where the XMR went: your Monero address is sealed in your browser before the order is made and never appears on Solana. Once the XMR lands, Monero hides senders, receivers and amounts by default.</>],
      ['If something goes wrong', <>If an order cannot be paid as quoted, your SOL goes to the refund address you gave, minus the network fee. The <Link className="link" href={helpLink('refunded')}>Help page</Link> covers each case.</>],
    ],
  },
  {
    slug: 'pump-fun-to-xmr',
    title: 'How to move a pump.fun coin into Monero.',
    metaTitle: 'How to move a pump.fun coin into Monero (XMR)',
    description: 'Exit any pump.fun coin, on the bonding curve or graduated, straight to real Monero at your own address in one signature.',
    card: 'pump.fun to XMR.',
    intro: <>Any pump.fun coin, still on the bonding curve or already graduated, can go straight to real XMR at your own Monero address. One transaction sells the coin and places the order; you do not need to sell to SOL first.</>,
    quote: 'pump',
    cta: { href: '/swap', label: 'Open the swap page' },
    steps: [
      ['Get a Monero address', wallet],
      ['Find your coin', <>Open <Link className="link" href="/swap">Swap</Link> and connect the wallet that holds the coin. Tap the token: the coins in your wallet are listed first, with balances. Or paste the coin&apos;s address, the long string that ends in <code>pump</code>.</>],
      ['Read the quote', <>Type the amount and paste your Monero address. The quote shows the XMR you will receive with the 0.6% fee already in it, and the price impact of selling that amount of the coin. A small or thinly traded coin moves more when you sell it, so check that line. If a coin cannot be traded, the page says so instead of failing later.</>],
      ['Sign once and wait', <>One transaction sells the coin and sends the order; the page checks it before your wallet is asked to sign. When it is final on Solana, about 15 seconds, the solver pays XMR from its own Monero wallet, usually within seconds. {arrives}</>],
    ],
    notes: [
      ['Limits', <>The private exit starts at 0.01 XMR and has a per-order maximum; the swap page shows what it can cover right now. For a bigger sale, split it or use the Standard exit: through the wXMR bridge, from 0.1 XMR, {PLATFORM_FEE_BPS / 100}% plus the bridge&apos;s 0.1%, and it puts your Monero address on Solana.</>],
      ['What stays public', stillPublic],
      ['If something goes wrong', refund],
    ],
  },
  {
    slug: 'check-payment-proof',
    title: 'How to check a Monero payment proof.',
    metaTitle: 'How to check a Monero payment proof (tx key)',
    description: 'Confirm for yourself that a Nero exit paid your Monero address: the transaction, its tx key and your address, checked in the Monero GUI wallet or on the command line.',
    card: 'Check your proof.',
    intro: <>Every exit ends with a Monero transaction and its key. With those two and your own address, a Monero wallet can confirm how much was paid to you. You do not have to take this site&apos;s word for it.</>,
    cta: { href: '/swap', label: 'Open the swap page' },
    steps: [
      ['Look in your wallet first', <>Open the Monero wallet that owns the address you gave. The payment shows within a minute or two and can be spent after 10 confirmations, about 20 minutes. For most people that is all the proof they need. The steps below are for when you want to check it independently, or show someone else that you were paid.</>],
      ['Collect three things', <>On the order page, under the paid status, there are two lines: <b>Monero tx</b>, the transaction ID, and <b>Tx key (proof)</b>. Tap either one to copy it. The third thing is the Monero address you typed for that order. On a private exit the page shows these only in the browser that made the order, so keep its link; the swap page lists that browser&apos;s recent exits and leads back to each one.</>],
      ['Check it in the Monero GUI wallet', <>Open the Monero GUI wallet, go to <b>Advanced</b>, then <b>Prove/check</b>. In the <b>Check</b> part, paste the transaction ID, your address and the tx key, then press <b>Check</b>. Any wallet file will do: it does not have to be the wallet the address belongs to.</>],
      ['Or check it on the command line', <>In <code>monero-wallet-cli</code>, with any wallet open, type <code>check_tx_key</code> followed by the transaction ID, the tx key and your address, in that order, with a space between each.</>],
      ['Read the result', <>The wallet says how much XMR that transaction paid to that address; the GUI also shows how many confirmations it has. The amount should be the XMR on your order page. A wrong key or someone else&apos;s address gives an error or zero: the key only proves this one payment.</>],
    ],
    notes: [
      ['Feather Wallet', <>Feather has a check under <b>Tools</b>, then <b>Verify transaction proof</b>, but its documentation describes it for signed proofs made by the sender&apos;s wallet, not for a bare tx key. For the key on your order page, use the Monero GUI wallet or the command line.</>],
      ['Block explorers', <>Some Monero block explorers can run the same check in a web page. It works, but then that site learns your address, the transaction and the amount together. A wallet on your own computer tells no one.</>],
      ['Who can see the proof', <>Anyone who has the transaction ID, the tx key and your address can see that the payment was made and how much it was, and nothing else about your wallet. On a private exit, the order page gives them only to the browser that made the order, so share them only with someone you want to prove the payment to. On the Standard exit the bridge publishes the transaction and its key on Solana, next to your Monero address; the <Link className="link" href="/docs">Paper</Link> says so under what each route makes public.</>],
      ['If the check shows nothing', <>Make sure the address is exactly the one on the order (a subaddress, which starts with 8, is not the same as the wallet&apos;s main address), and that the transaction ID and key were copied whole. If it still shows nothing and your wallet shows no payment, send the order page link to <a className="link" href={`https://x.com/${BRAND.x}`} target="_blank" rel="noreferrer">@{BRAND.x}</a>.</>],
    ],
  },
]

export const guide = (slug: string) => GUIDES.find((g) => g.slug === slug)
