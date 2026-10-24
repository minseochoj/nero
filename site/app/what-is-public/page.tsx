import Link from 'next/link'
import { pageMeta } from '@/lib/meta'
import { helpLink } from '@/lib/helpAnchors'
import { PUBLIC_PATH, PUBLIC_TOC, xNetworks } from '@/lib/whatIsPublic'

export const metadata = pageMeta('What is public', 'Route by route: what anyone can read on Solana, what Monero hides, and what Nero itself knows about an exit.', PUBLIC_PATH)

// One route: what each side shows. The facts are the Paper's own (sections 03, 04, 07, 09 and 12); change them together.
function Seen({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <table>
      <tbody>{rows.map(([where, what]) => <tr key={where}><th scope="row">{where}</th><td>{what}</td></tr>)}</tbody>
    </table>
  )
}

export default function WhatIsPublic() {
  return (
    <div className="wrap doc">
      <nav className="doc-toc" aria-label="On this page">{PUBLIC_TOC.map(([id, l]) => <a key={id} href={`#${id}`}>{l}</a>)}</nav>
      <article>
        <p className="kicker">What is public</p>
        <h1>What anyone can see.</h1>
        <p>Solana is a public ledger and Monero is a private one. An exit crosses from the first to the second, so part of it is always on show. This page says which part, for each route, and what Nero itself knows. The same facts are in the <Link className="link" href="/docs#privacy">Paper</Link>; here they are side by side.</p>
        <p className="callout">On every route the Solana side is public: that a wallet sent funds, when, and how much. What differs is whether your Monero address is on Solana too.</p>

        <h2 id="private">Private exit, with a wallet</h2>
        <p>You sign one transaction. Our solver pays XMR from its own Monero wallet.</p>
        <Seen rows={[
          ['On Solana', <>Your wallet, the token and the amount, the time, and that the funds went to Nero&apos;s deposit wallet. The transaction carries a note holding your Monero address, sealed in your browser so only the solver can open it. To everyone else it is unreadable.</>],
          ['Not on Solana', <>Your Monero address, the Monero transaction and its tx key.</>],
          ['On Monero', <>A transaction like any other. Monero hides who sent it, who received it and how much.</>],
          ['Known to Nero', <>The solver opens the sealed address to pay it, so it knows which Solana wallet paid which Monero address. It keeps that in its own records and publishes none of it.</>],
          ['Only in your browser', <>The payment proof (the Monero transaction and its tx key). It is shown to the browser that made the order and to no one else.</>],
        ]} />

        <h2 id="send-sol">Private exit, Send SOL</h2>
        <p>No wallet is connected. You send SOL to a one-time address from any wallet or exchange.</p>
        <Seen rows={[
          ['On Solana', <>The transfer into the one-time address: who sent it (your wallet, or the exchange&apos;s), the amount and the time. The address is later emptied into Nero&apos;s deposit wallet, so it can be tied to Nero. If an order is refunded, the refund goes to the Solana address you gave, in public.</>],
          ['Not on Solana', <>Your Monero address. It is sealed in your browser and handed to the solver in that form; on this route it is never written to the chain at all.</>],
          ['On Monero', <>The same as above: sender, receiver and amount are hidden.</>],
          ['Known to Nero', <>Which one-time address paid which Monero address, and the refund address you gave.</>],
        ]} />

        <h2 id="other-assets">Private exit, other assets</h2>
        <p>USDC or USDT on Solana, or a coin on {xNetworks()}. A third-party route carries the funds to our solver.</p>
        <Seen rows={[
          ['On your network', <>Your transfer to the one-time address there: your sending address, the asset, the amount and the time.</>],
          ['On Solana', <>SOL arriving at a one-time address of our solver, and that address being emptied into Nero&apos;s deposit wallet.</>],
          ['Known to the route', <>Your deposit and the refund address you gave on your own network. It never sees your Monero address.</>],
          ['Known to Nero', <>The order, the Monero address it paid, and the route&apos;s record of your deposit.</>],
          ['On Monero', <>Sender, receiver and amount are hidden.</>],
        ]} />

        <h2 id="standard">Standard exit</h2>
        <p>For amounts larger than the solver can cover. It runs through the wXMR bridge, and it is the one route that names your Monero address in public.</p>
        <Seen rows={[
          ['On Solana', <>Your wallet, what you swapped and how much, <strong>the Monero address you exit to</strong>, and the bridge&apos;s Monero transaction and tx key once it has paid.</>],
          ['On Monero', <>The transaction hides its sender, receiver and amount as always. But with the tx key from Solana, anyone can confirm that your address received that amount.</>],
          ['Known to the bridge', <>Everything above. The bridge is a third party; Nero does not run it.</>],
        ]} />
        <p>Use a fresh subaddress for a standard exit, and send the XMR on to another of your own addresses before spending it.</p>

        <h2 id="enter">Enter, from Monero</h2>
        <Seen rows={[
          ['On Solana', <>Your wallet, the Monero subaddress the bridge gave it, and the wXMR you receive.</>],
          ['Not shown', <>Where the XMR came from. The record says this wallet receives from Monero, not from whom.</>],
        ]} />

        <h2 id="numbers">Our own numbers</h2>
        <p>The <Link className="link" href="/verify">Verify page</Link> and the public API publish private exits as running totals only: how many, and how much XMR. Never per order and never per day, so no single exit can be picked out by its date and size. An order&apos;s signed promise is safe to share: it names the amounts and a hash of the sealed address, never the address itself.</p>

        <h2 id="browser">This browser</h2>
        <p>Your recent exits, the last token you used and each private order&apos;s proof are kept in this browser&apos;s own storage, not on a server. Clearing site data removes them. An order link holds the order&apos;s public id only, so it shows nothing in anyone else&apos;s browser.</p>

        <h2 id="after">After the XMR lands</h2>
        <p>Nothing that happens next is visible. Monero hides the sender, receiver and amount of every later transaction. Three habits keep the Solana side from saying more than it has to:</p>
        <ul>
          <li>Exit to a fresh subaddress each time (it starts with 8).</li>
          <li>Avoid round amounts, and do not spend the moment it arrives.</li>
          <li>Never post a tx key or an order&apos;s proof in public: it shows your address and the amount.</li>
        </ul>
        <p>Not sure which route fits? Help has a short answer on <Link className="link" href={helpLink('which-exit')}>which exit to use</Link>, and the <Link className="link" href="/docs#trust">Paper</Link> lists who you trust on each.</p>
      </article>
    </div>
  )
}
