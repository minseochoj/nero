import test from 'node:test'
import assert from 'node:assert/strict'
import { swapLink } from '../lib/swapLink.ts'
import { EXIT_TOKENS } from '../lib/tokens.ts'

const BASE = 'https://www.neroswap.app'
const USDC = EXIT_TOKENS.find((t) => t.symbol === 'USDC')!.mint

test('no options is the plain swap page', () => {
  assert.equal(swapLink(BASE), `${BASE}/swap`)
  assert.equal(swapLink(`${BASE}/`), `${BASE}/swap`)
})

test('token and amount use the parameters the swap forms read', () => {
  const u = new URL(swapLink(BASE, { token: 'USDC', amount: '250' }))
  assert.equal(u.pathname, '/swap')
  assert.equal(u.searchParams.get('in'), USDC)
  assert.equal(u.searchParams.get('amount'), '250')
  assert.equal(u.searchParams.get('tab'), null) // the private exit is the default tab
})

test('the standard exit and enter tabs are named, the private one is left out', () => {
  assert.equal(new URL(swapLink(BASE, { tab: 'exit', token: 'SOL', amount: '30' })).searchParams.get('tab'), 'exit')
  assert.equal(new URL(swapLink(BASE, { tab: 'enter' })).searchParams.get('tab'), 'enter')
  assert.equal(swapLink(BASE, { tab: 'private' }), `${BASE}/swap`)
})

test('amounts the forms would ignore are refused', () => {
  for (const bad of ['', '.', '1,5', '1e3', '-1', '1.2.3', ' 1', '1 SOL']) assert.throws(() => swapLink(BASE, { amount: bad }), bad)
  for (const ok of ['1', '0.5', '.5', '1.', '1000000']) assert.match(swapLink(BASE, { amount: ok }), /amount=/)
})

test('a link never carries a Monero address or anything else', () => {
  const u = new URL(swapLink(BASE, { tab: 'exit', token: 'USDT', amount: '10' }))
  assert.deepEqual([...u.searchParams.keys()].sort(), ['amount', 'in', 'tab'])
  // @ts-expect-error unknown options are not part of the format
  assert.equal(swapLink(BASE, { addr: '4abc' }), `${BASE}/swap`)
})

test('unknown tokens and tabs are refused', () => {
  // @ts-expect-error
  assert.throws(() => swapLink(BASE, { token: 'BONK' }))
  // @ts-expect-error
  assert.throws(() => swapLink(BASE, { tab: 'admin' }))
})
