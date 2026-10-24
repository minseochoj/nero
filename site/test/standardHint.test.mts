import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { STANDARD_NOTE, standardWhy } from '../lib/standardHint.ts'

test('a working private exit offers nothing else', () => {
  assert.equal(standardWhy(true, ''), null)
  assert.equal(standardWhy(null, ''), null) // solver info not loaded yet
  assert.equal(standardWhy(true, 'No quote right now'), null)
  assert.equal(standardWhy(true, 'No price right now. Try again in a moment.'), null) // the standard exit asks the same swap API
  assert.equal(standardWhy(true, 'This token cannot be traded'), null)
})

test('paused, over the limit or out of reserve: as before', () => {
  assert.equal(standardWhy(false, ''), 'paused')
  assert.equal(standardWhy(false, 'Prices are moving fast. Try again in a minute.'), 'paused')
  assert.equal(standardWhy(true, 'The maximum is 0.5 XMR per order'), 'limit')
  assert.equal(standardWhy(true, 'Not enough XMR in reserve right now'), 'limit')
  assert.equal(standardWhy(true, 'Daily limit reached'), 'limit')
})

test('the solver’s price-gap refusal offers the standard exit', () => {
  // the exact words the solver answers with (solver/index.js, price())
  const solver = readFileSync(new URL('../../solver/index.js', import.meta.url), 'utf8')
  const said = 'Prices are moving fast. Try again in a minute.'
  assert.ok(solver.includes(said), 'the solver no longer says this: update standardWhy')
  assert.equal(standardWhy(true, said), 'prices')
})

test('the price-gap note does not promise the usual price', () => {
  assert.match(STANDARD_NOTE.prices, /may be lower/)
  assert.match(STANDARD_NOTE.prices, /check its quote/)
  assert.doesNotMatch(STANDARD_NOTE.prices, /no such limit/)
  for (const t of Object.values(STANDARD_NOTE)) assert.doesNotMatch(t, /jupiter/i)
})
