/*
  Tests for the order alert rules (lib/orderAlert.ts). No network, no browser:
    npx tsx --test test/orderAlert.test.mts        (or: npm test)
*/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALERT, canOffer, shouldNotify, tabTitle } from '../lib/orderAlert'

const live = { sawPending: true, outcome: 'paid' as const, hidden: true, permission: 'granted', already: false }

test('notifies once when a watched order ends in a background tab', () => {
  assert.equal(shouldNotify(live), true)
  assert.equal(shouldNotify({ ...live, outcome: 'refunded' }), true)
  assert.equal(shouldNotify({ ...live, already: true }), false)
})

test('stays quiet for an order that was already finished when the page opened', () => {
  assert.equal(shouldNotify({ ...live, sawPending: false }), false)
})

test('stays quiet while in progress, in a visible tab, or without a yes from the user', () => {
  assert.equal(shouldNotify({ ...live, outcome: null }), false)
  assert.equal(shouldNotify({ ...live, hidden: false }), false)
  assert.equal(shouldNotify({ ...live, permission: 'default' }), false)
  assert.equal(shouldNotify({ ...live, permission: 'denied' }), false)
})

test('permission is only offered once an order exists and is still in progress', () => {
  const ok = { known: true, outcome: null, supported: true, permission: 'default' }
  assert.equal(canOffer(ok), true)
  assert.equal(canOffer({ ...ok, known: false }), false) // no order status yet
  assert.equal(canOffer({ ...ok, outcome: 'paid' }), false)
  assert.equal(canOffer({ ...ok, supported: false }), false)
  assert.equal(canOffer({ ...ok, permission: 'granted' }), false)
  assert.equal(canOffer({ ...ok, permission: 'denied' }), false) // answered before: never ask again
})

test('tab title names the ending and goes back to normal', () => {
  assert.equal(tabTitle('Swap · Nero', 'paid'), 'XMR sent · Swap · Nero')
  assert.equal(tabTitle('Swap · Nero', 'refunded'), 'Refunded · Swap · Nero')
  assert.equal(tabTitle('Swap · Nero', null), 'Swap · Nero')
})

test('notification text carries no amount, address or transaction id', () => {
  for (const a of Object.values(ALERT)) {
    const all = `${a.title} ${a.head} ${a.body}`
    assert.equal(/\d/.test(all), false)
    assert.ok(all.length < 140)
  }
})
