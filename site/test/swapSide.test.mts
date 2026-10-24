import test from 'node:test'
import assert from 'node:assert/strict'
import { SIDE_VIEWS, STILL_PUBLIC, sidePublicLink, sideText, sideView } from '../lib/swapSide.ts'
import { PUBLIC_PATH, PUBLIC_TOC } from '../lib/whatIsPublic.ts'
import { PLATFORM_FEE_BPS } from '../lib/constants.ts'
import { X_ASSETS } from '../lib/xchain.ts'

test('the side follows the tab, and the way of sending inside the private exit', () => {
  assert.equal(sideView('private', 'wallet'), 'wallet')
  assert.equal(sideView('private', 'send'), 'send')
  assert.equal(sideView('private', 'x'), 'x')
  // the other tabs have one form each: a way of sending left over from the private exit must not leak in
  assert.equal(sideView('exit', 'send'), 'exit')
  assert.equal(sideView('enter', 'x'), 'enter')
})

test('every view has its own heading, a lead, three steps and facts', () => {
  const headings = new Set<string>()
  for (const v of SIDE_VIEWS) {
    const t = sideText(v)
    assert.ok(t.heading && t.lead, v)
    headings.add(t.heading)
    assert.equal(t.steps.length, 3, v)
    assert.ok(t.facts.length >= 4, v)
    assert.equal(new Set(t.steps.map((s) => s.title)).size, 3, `${v}: step titles are list keys`)
    assert.equal(new Set(t.facts.map((f) => f[0])).size, t.facts.length, `${v}: fact labels are list keys`)
    for (const s of t.steps) assert.ok(s.title && s.text, v)
    for (const [k, d] of t.facts) assert.ok(k && d, v)
    assert.ok(t.facts.some(([k]) => k === 'Still public'), `${v}: says what stays public`)
  }
  assert.equal(headings.size, SIDE_VIEWS.length)
})

const all = (v: Parameters<typeof sideText>[0]) => { const t = sideText(v); return [t.heading, t.lead, ...t.steps.flatMap((s) => [s.title, s.text]), ...t.facts.flat()].join(' | ') }

test('nothing is said to be signed where nothing is signed', () => {
  for (const v of ['send', 'x'] as const) {
    assert.doesNotMatch(all(v), /you sign|one signature|sign once/i, v)
    assert.match(all(v), /nothing to sign/i, v)
  }
  assert.doesNotMatch(all('enter'), /exit to monero|our solver/i)
})

test('the figures are the ones the forms state', () => {
  assert.match(all('wallet'), /0\.6%/)
  assert.ok(all('wallet').includes(`${PLATFORM_FEE_BPS / 100}% + 0.1% bridge`))
  assert.match(all('send'), /0\.9%/)
  assert.match(all('send'), /15 minutes/)
  assert.match(all('x'), /0\.9%/)
  assert.match(all('x'), /0\.2 XMR/)
  assert.ok(all('exit').includes(`${PLATFORM_FEE_BPS / 100}% to Nero`))
  assert.match(all('exit'), /0\.1 XMR/)
  assert.match(all('enter'), /0\.1 XMR per deposit/)
})

test('the networks named for other assets are the ones on offer (the slow chains are hidden)', () => {
  const offered = [...new Set(X_ASSETS.filter((a) => !a.float).map((a) => a.chainName))]
  const named = sideText('x').facts.find(([k]) => k === 'Networks')![1]
  for (const n of offered) assert.ok(named.includes(n), n)
  for (const a of X_ASSETS.filter((a) => a.float)) assert.ok(!named.includes(a.chainName), a.chainName)
})

test('each view links its own section of the What is public page, and the section exists', () => {
  const sections = new Set(PUBLIC_TOC.map(([id]) => id))
  const seen = new Set<string>()
  for (const v of SIDE_VIEWS) {
    const [path, id] = sidePublicLink(v).split('#')
    assert.equal(path, PUBLIC_PATH, v)
    assert.ok(sections.has(id), `${v}: #${id} is not a section of the page`)
    seen.add(id)
    // the link follows the fact's own sentence, so that sentence must not end with a full stop of its own
    const fact = sideText(v).facts.find(([k]) => k === STILL_PUBLIC)![1]
    assert.doesNotMatch(fact, /[.!?]$/, v)
  }
  assert.equal(seen.size, SIDE_VIEWS.length, 'two views share a section')
  assert.equal(sidePublicLink('send'), '/what-is-public#send-sol')
  assert.equal(sidePublicLink('exit'), '/what-is-public#standard')
})
