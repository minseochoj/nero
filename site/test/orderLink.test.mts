import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ELSEWHERE, LINK_HOLDS, PROOF_GUIDE, isOrderId, madeElsewhere, orderLink } from '../lib/orderLink.ts'

const BASE = 'https://www.neroswap.app'
const SIG = '5TsZCt5A'.padEnd(88, 'a')
const ADDR = '5GDP6viv4mK1XE2RBtdLoz3ct65YFjq6yfFoqXBi7bbk'

test('each kind uses the parameter its order page reads', () => {
  assert.equal(orderLink(BASE, 'wallet', SIG), `${BASE}/swap?tab=private&o=${SIG}`)
  assert.equal(orderLink(BASE, 'send', ADDR), `${BASE}/swap?tab=private&d=${ADDR}`)
  assert.equal(orderLink(`${BASE}/`, 'x', ADDR), `${BASE}/swap?tab=private&x=${ADDR}`)
})

test('the link holds the tab and the id, and nothing else', () => {
  for (const [kind, id] of [['wallet', SIG], ['send', ADDR], ['x', ADDR]] as const) {
    const u = new URL(orderLink(BASE, kind, id))
    assert.equal(u.pathname, '/swap')
    assert.equal(u.hash, '')
    assert.deepEqual([...u.searchParams.keys()].sort(), ['tab', kind === 'wallet' ? 'o' : kind === 'send' ? 'd' : 'x'].sort())
  }
})

test('anything that is not a plain id is refused, so nothing else can ride along', () => {
  const secret = 'a'.repeat(64)
  for (const bad of ['', 'abc', `${ADDR}&s=${secret}`, `${ADDR}#${secret}`, `${ADDR} `, ADDR.replace('5', '0'), 'l'.repeat(40), 'a'.repeat(60)]) {
    assert.throws(() => orderLink(BASE, 'send', bad), /not an order id/, bad)
  }
  assert.throws(() => orderLink(BASE, 'wallet', ADDR), /not an order id/) // an address is not a transaction
  assert.throws(() => orderLink(BASE, 'send', SIG), /not an order id/)
  assert.throws(() => orderLink(BASE, 'other' as any, ADDR), /not an order id/)
})

test('every kind says what its link holds', () => {
  for (const kind of ['wallet', 'send', 'x'] as const) assert.ok(LINK_HOLDS[kind].length > 10)
})

test('a link to an order this browser does not hold is told apart from a known one and from junk', () => {
  assert.equal(madeElsewhere('send', ADDR, []), true)
  assert.equal(madeElsewhere('x', ADDR, ['11111111111111111111111111111111']), true)
  assert.equal(madeElsewhere('wallet', SIG, []), true)
  assert.equal(madeElsewhere('send', ADDR, [ADDR]), false) // this browser made it: the order page shows instead
  for (const junk of [null, undefined, '', 'abc', '<script>', `${ADDR}&s=1`]) assert.equal(madeElsewhere('send', junk, []), false)
  assert.equal(madeElsewhere('wallet', ADDR, []), false) // an address is not a transaction
})

test('the line shown for such a link names no order and makes no promise', () => {
  assert.match(ELSEWHERE, /another browser/)
  assert.ok(!/lost|refund/i.test(ELSEWHERE))
  assert.equal(isOrderId('send', ADDR), true)
  assert.equal(isOrderId('send', SIG), false)
})

test('the proof guide the order pages link to is a guide that exists', () => {
  const guides = readFileSync(new URL('../lib/guides.tsx', import.meta.url), 'utf8')
  const slug = PROOF_GUIDE.replace('/guides/', '')
  assert.match(PROOF_GUIDE, /^\/guides\/[a-z-]+$/)
  assert.ok(guides.includes(`slug: '${slug}'`), slug)
  for (const f of ['PrivateExit', 'PrivateDeposit', 'PrivateCross']) assert.ok(readFileSync(new URL(`../components/${f}.tsx`, import.meta.url), 'utf8').includes('<ProofGuide />'), f)
  assert.ok(readFileSync(new URL('../components/Tracker.tsx', import.meta.url), 'utf8').includes('href={PROOF_GUIDE}'))
})
