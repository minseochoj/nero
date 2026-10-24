import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HELP_ANCHORS } from '../lib/helpAnchors.ts'
import { HELP_LINE, orderHelp } from '../lib/orderHelp.ts'

const KINDS = ['wallet', 'send', 'x'] as const
const STATES = ['waiting', 'awaiting', 'paying', 'paid', 'expired', 'closed', 'refund_pending', 'refunding', 'refunded', 'stuck', 'held', 'resolved']

test('a refunded order and one being checked by hand link their own Help answer', () => {
  assert.equal(orderHelp('wallet', 'refunded'), 'refunded')
  assert.equal(orderHelp('send', 'refunded'), 'refunded')
  for (const k of KINDS) assert.equal(orderHelp(k, 'stuck'), 'checked-by-hand')
  assert.equal(orderHelp('x', 'held'), 'checked-by-hand')
  assert.equal(orderHelp('x', 'resolved'), 'checked-by-hand')
  // with a wallet, "held" means funds arrived without an order; from another chain a return is the route's
  assert.equal(orderHelp('wallet', 'held'), 'no-order')
  assert.equal(orderHelp('x', 'refunded'), 'late-deposit')
})

test('every answer an order page can link exists on Help and has words for its link', () => {
  for (const k of KINDS) for (const s of STATES) {
    const a = orderHelp(k, s)
    if (!a) continue
    assert.ok((HELP_ANCHORS as readonly string[]).includes(a), `${k}/${s}: ${a}`)
    assert.ok(HELP_LINE[a], `${a} has no link text`)
  }
  for (const a of ['refunded', 'checked-by-hand']) assert.ok((HELP_ANCHORS as readonly string[]).includes(a), a)
})

test('an order that is still moving, paid or unknown links nothing', () => {
  for (const k of KINDS) for (const s of ['waiting', 'awaiting', 'paying', 'paid', 'expired', 'closed', 'refunding', '', 'toString', 'constructor']) assert.equal(orderHelp(k, s), null, `${k}/${s}`)
  assert.equal(orderHelp('wallet', null), null)
  assert.equal(orderHelp('send', undefined), null)
  assert.equal(orderHelp('nope' as never, 'refunded'), null)
})

test('the three private order pages draw the line, and none types a Help address by hand', () => {
  for (const [f, kind] of [['PrivateExit', 'wallet'], ['PrivateDeposit', 'send'], ['PrivateCross', 'x']] as const) {
    const src = readFileSync(new URL(`../components/${f}.tsx`, import.meta.url), 'utf8')
    assert.ok(src.includes(`<OrderHelp kind="${kind}"`), f)
    assert.ok(!/\/help#/.test(src), `${f}: link an answer through helpLink`)
  }
})
