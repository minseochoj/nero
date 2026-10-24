'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { BRAND } from '@/lib/brand'
import { SOLVER_BOX_PUB, SOLVER_DEPOSIT } from '@/lib/v2'
import { ago } from '@/lib/format'

/*
  Everything on this page is read from your browser, from the same public endpoints the app uses, and checked here:
  the keys against the ones written in this site's code, our node against a public Monero node we do not run, and a
  signed promise against the public deposit wallet. Nothing here asks you to take our word for it.
*/

type Info = { version: string; enabled: boolean; deposit: string; boxPub: string } | null
type Node = { ours: { height: number; targetHeight: number; synchronized: boolean; topBlockHash: string; walletHeight: number | null; at: number } | null; reference: { node: string; height: number; hashAtOurTop: string; match: boolean } | null } | null

const pinnedBox = btoa(String.fromCharCode(...SOLVER_BOX_PUB))
const short = (s: string, n = 10) => (s.length > n * 2 + 1 ? `${s.slice(0, n)}…${s.slice(-n)}` : s)
const commitLink = (c: string) => (c && c !== 'dev' ? `${BRAND.github}/commit/${c}` : BRAND.github)

function Mark({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="faint">·</span>
  return <span style={{ color: ok ? 'var(--ok)' : 'var(--bad)' }} aria-label={ok ? 'checks out' : 'does not match'}>{ok ? '✓' : '✕'}</span>
}

export default function Verify() {
  const [info, setInfo] = useState<Info | undefined>(undefined)
  const [node, setNode] = useState<Node | undefined>(undefined)

  useEffect(() => {
    let dead = false
    const load = async () => {
      const [i, n] = await Promise.allSettled([
        fetch('/api/v2/info', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
        fetch('/api/node', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)),
      ])
      if (dead) return
      setInfo(i.status === 'fulfilled' ? i.value : null)
      setNode(n.status === 'fulfilled' ? n.value : null)
    }
    load()
    const t = setInterval(load, 30_000)
    return () => { dead = true; clearInterval(t) }
  }, [])

  const depositOk = info ? info.deposit === SOLVER_DEPOSIT.toBase58() : null
  const boxOk = info ? info.boxPub === pinnedBox : null
  const sameCommit = info && BRAND.commit !== 'dev' && info.version !== 'dev' ? info.version === BRAND.commit : null
  const o = node?.ours, ref = node?.reference

  return (
    <>
      <div className="page-head">
        <p className="kicker">Verify</p>
        <h1 className="h-1">Check Nero yourself.</h1>
        <p className="lead">Every line below is read live in your browser and checked here, against the site&apos;s own code and against a Monero node we do not run. Nero is not trustless; this is how small the trust is, and how to see it.</p>
      </div>

      <section style={{ marginTop: 36 }}>
        <h2 className="h-2" style={{ marginBottom: 14 }}>The code</h2>
        <dl className="ledger">
          <div><dt>Source</dt><dd>The site and the solver are open source: <a className="link" href={BRAND.github} target="_blank" rel="noreferrer">{BRAND.github.replace('https://', '')}</a>. Read it, run the tests, run your own.</dd></div>
          <div><dt>This site</dt><dd>Built from commit <a className="link mono" href={commitLink(BRAND.commit)} target="_blank" rel="noreferrer">{BRAND.commit.slice(0, 12)}</a>.</dd></div>
          <div><dt>The solver</dt><dd>{info === undefined ? 'Reading…' : !info ? 'Not answering right now.' : <>Reports commit <a className="link mono" href={commitLink(info.version)} target="_blank" rel="noreferrer">{info.version.slice(0, 12)}</a>{sameCommit !== null && <> {' '}<Mark ok={sameCommit} /> {sameCommit ? 'the same as this site' : 'a different commit from this site (the two deploy separately)'}</>}.</>}</dd></div>
          <div><dt>Can&apos;t prove</dt><dd>That a server runs exactly the published code. The commits above are what each part reports about itself. The checks below do not depend on it.</dd></div>
        </dl>
      </section>

      <section style={{ marginTop: 48 }}>
        <h2 className="h-2" style={{ marginBottom: 14 }}>The keys</h2>
        <dl className="ledger">
          <div><dt>Deposit wallet</dt><dd><span className="mono" style={{ wordBreak: 'break-all' }}>{SOLVER_DEPOSIT.toBase58()}</span><br /><span className="muted">Written in the site&apos;s code (<code>site/lib/v2.ts</code>). Every private order pays it, and every refund comes from it. </span><a className="link" href={`https://solscan.io/account/${SOLVER_DEPOSIT.toBase58()}`} target="_blank" rel="noreferrer">Every transaction on Solscan ↗</a></dd></div>
          <div><dt>Solver says</dt><dd><Mark ok={depositOk} /> {info === undefined ? 'Reading…' : !info ? 'Not answering right now.' : depositOk ? 'The solver reports the same deposit wallet.' : <>The solver reports <span className="mono">{short(info.deposit)}</span>. Do not send anything until this matches.</>}</dd></div>
          <div><dt>Sealing key</dt><dd><span className="mono" style={{ wordBreak: 'break-all' }}>{pinnedBox}</span><br /><Mark ok={boxOk} /> <span className="muted">{boxOk === null ? 'Reading…' : boxOk ? 'The solver reports the same key. Your browser seals your Monero address to this one, written in the code, never to one fetched at order time.' : 'The solver reports a different key. Do not send anything until this matches.'}</span></dd></div>
        </dl>
      </section>

      <section style={{ marginTop: 48 }}>
        <h2 className="h-2" style={{ marginBottom: 14 }}>Our Monero node</h2>
        <dl className="ledger">
          <div><dt>Our node</dt><dd>{node === undefined ? 'Reading…' : !o ? 'Not answering right now.' : <>Block <span className="num">{o.height.toLocaleString('en-US')}</span>{o.synchronized ? ', in sync' : <>, catching up to <span className="num">{o.targetHeight.toLocaleString('en-US')}</span></>}. Read {ago(o.at)}.</>}</dd></div>
          <div><dt>Top block</dt><dd>{o ? <span className="mono" style={{ wordBreak: 'break-all' }}>{o.topBlockHash}</span> : '·'}</dd></div>
          <div><dt>A public node</dt><dd>{node === undefined ? 'Reading…' : !ref ? 'No public node answered just now.' : <><Mark ok={ref.match} /> {ref.match ? <>{ref.node}, which we do not run, has the same block at the same height. Our node is on the real Monero chain.</> : <>{ref.node} has a different block at that height. It may be one block apart; this is read again every 30 seconds.</>} It is at block <span className="num">{ref.height.toLocaleString('en-US')}</span>.</>}</dd></div>
          <div><dt>The wallet</dt><dd>{o?.walletHeight ? <>The solver&apos;s Monero wallet has read up to block <span className="num">{o.walletHeight.toLocaleString('en-US')}</span>, through our node only. No outside node sees which transactions are ours.</> : '·'}</dd></div>
        </dl>
        <p className="faint" style={{ marginTop: 12, fontSize: 13.5 }}>The same data as JSON: <a className="link" href="/api/node">/api/node</a>. Compare the hash with any Monero block explorer.</p>
      </section>

      <PromiseCheck />

      <section style={{ marginTop: 48 }}>
        <h2 className="h-2" style={{ marginBottom: 14 }}>Your payment</h2>
        <dl className="ledger">
          <div><dt>The proof</dt><dd>A paid order shows its Monero transaction and the transaction key. With your address, any Monero wallet checks that the payment reached you, without us: <span className="mono">check_tx_key</span> in the command line wallet, or the payment check in Feather and Monero GUI. <Link className="link" href="/guides/check-payment-proof">Step by step</Link>.</dd></div>
          <div><dt>Keep it</dt><dd>The proof shows your address and the amount, so keep it to yourself. The signed promise is the one to show if you ever need to.</dd></div>
        </dl>
      </section>

      <section style={{ marginTop: 48 }}>
        <h2 className="h-2" style={{ marginBottom: 14 }}>What you still trust</h2>
        <dl className="ledger">
          <div><dt>Our solver</dt><dd>For the seconds between your deposit and its payout, and for the refund if it cannot pay. Orders are capped per order and per day to keep that small.</dd></div>
          <div><dt>The reserve</dt><dd>We show the solver&apos;s reserve as a number, not as a Monero reserve proof, on purpose: a reserve proof reveals key images, which would mark our payouts on the Monero chain and weaken your privacy. The per-order cap is the protection instead.</dd></div>
          <div><dt>Standard exit</dt><dd>The wXMR bridge, a third party, for the XMR behind wXMR. The <Link className="link" href="/docs#trust">Paper</Link> lists every party and what you trust it for.</dd></div>
        </dl>
      </section>
    </>
  )
}

/** Paste an order's promise and its signature: checked here, in the browser, against the public deposit wallet. */
function PromiseCheck() {
  const [text, setText] = useState('')
  const [sig, setSig] = useState('')
  let verdict: { ok: boolean; why: string } | null = null
  // a promise copied from an order page carries its signature as a last line: split it off
  const pasted = text.replace(/\r\n/g, '\n').trim()
  const inline = (pasted.match(/\nsignature: (\S+)$/) || [])[1]
  const body = inline ? pasted.slice(0, pasted.lastIndexOf('\nsignature: ')) : pasted
  const signature = (sig.trim() || inline || '').trim()
  if (body && signature) {
    try {
      const t = body
      const s = bs58.decode(signature)
      const signedBy = (t.match(/^signed by: (\S+)$/m) || [])[1]
      if (s.length !== 64) verdict = { ok: false, why: 'That is not a signature: it should be 64 bytes in base58.' }
      else if (signedBy !== SOLVER_DEPOSIT.toBase58()) verdict = { ok: false, why: 'This promise names a different signer, not the Nero deposit wallet.' }
      else if (nacl.sign.detached.verify(new TextEncoder().encode(t), s, SOLVER_DEPOSIT.toBytes())) verdict = { ok: true, why: 'Signed by the Nero deposit wallet. Every line of this promise is exactly as Nero made it.' }
      else verdict = { ok: false, why: 'The signature does not match this text. Something in it was changed, or it was not made by Nero.' }
    } catch { verdict = { ok: false, why: 'That is not a signature: it should be 64 bytes in base58.' } }
  }
  return (
    <section style={{ marginTop: 48 }}>
      <h2 className="h-2" style={{ marginBottom: 6 }}>Check a signed promise</h2>
      <p className="muted" style={{ margin: '0 0 16px', maxWidth: 640 }}>Every order comes with a promise signed by the deposit wallet&apos;s own key: what you send, what you get, until when, and where a refund goes. Paste one here. It is checked in this browser and sent nowhere.</p>
      <div className="box" style={{ alignItems: 'stretch' }}>
        <textarea rows={8} spellCheck={false} placeholder="Nero order promise v1 …" value={text} onChange={(e) => setText(e.target.value)} aria-label="Promise text" />
      </div>
      <div className="box" style={{ marginTop: 10 }}>
        <textarea rows={2} spellCheck={false} placeholder="Signature (base58), if it is not already the last line above" value={sig} onChange={(e) => setSig(e.target.value.replace(/\s/g, ''))} aria-label="Signature" />
      </div>
      {verdict && <p role="status" style={{ marginTop: 12, color: verdict.ok ? 'var(--ok)' : 'var(--bad)' }}>{verdict.ok ? '✓ ' : '✕ '}{verdict.why}</p>}
    </section>
  )
}
