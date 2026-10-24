import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseExample, missingFields, extraFields, csvDrift, documentedPaths } from '../lib/apiDrift.ts'
import { DOCUMENTED } from '../lib/apiExamples.ts'

const page = readFileSync(new URL('../app/docs/api/page.tsx', import.meta.url), 'utf8')

test('every address on the page is in the drift list, and the other way round', () => {
  const onPage = documentedPaths(page)
  assert.ok(onPage.length >= 6)
  assert.deepEqual([...onPage].sort(), DOCUMENTED.map((d) => d.path).sort())
})

test('every example on the page reads as data', () => {
  for (const d of DOCUMENTED) {
    if (!d.example) continue
    if (d.kind === 'json') assert.doesNotThrow(() => parseExample(d.example!), d.path)
    else assert.deepEqual(csvDrift(d.example, d.example), [], d.path)
  }
})

test('a list cut short with … reads as an empty list', () => {
  assert.deepEqual(parseExample('{ "epochs": [ … ], "wallet": "5iNf…jw9z" }'), { epochs: [], wallet: '5iNf…jw9z' })
})

test('same names, other values: no drift', () => {
  const ex = { a: 1, solver: { paidPico: '1', halted: false }, list: [{ at: 1, sig: 'x' }] }
  const live = { a: 9, solver: { paidPico: '77', halted: true, extra: 1 }, list: [{ at: 5, sig: 'y', wallet: 'w' }, { at: 6 }], more: 1 }
  assert.deepEqual(missingFields(ex, live), [])
  assert.deepEqual(extraFields(ex, live), ['solver.extra', 'list[].wallet', 'more'])
})

test('a renamed or removed field is named with its full path', () => {
  const ex = { solver: { paidPico: '1', potPico: '2' }, payouts: [{ at: 1, pico: '1' }] }
  const live = { solver: { paidPico: '1' }, payouts: [{ at: 1, amount: '1' }] }
  assert.deepEqual(missingFields(ex, live), ['solver.potPico', 'payouts[].pico'])
})

test('a changed shape is drift; an empty live list cannot be judged', () => {
  assert.deepEqual(missingFields({ solver: { a: 1 } }, { solver: null }), ['solver: not an object any more'])
  assert.deepEqual(missingFields([{ mint: 'x' }], { error: 'no' }), ['(answer): not a list any more'])
  assert.deepEqual(missingFields({ recent: [{ at: 1 }] }, { recent: [] }), [])
})

test('CSV: the heading line must match and example lines must fit it', () => {
  const ex = 'day_utc,paid,payments\n2026-10-10,1.1,46'
  assert.deepEqual(csvDrift(ex, 'day_utc,paid,payments\r\n2026-10-11,0.2,3\r\n'), [])
  assert.equal(csvDrift(ex, 'day_utc,paid_xmr,payments\n').length, 1)
  assert.equal(csvDrift('a,b\n1,2,3', 'a,b\n').length, 1)
})
