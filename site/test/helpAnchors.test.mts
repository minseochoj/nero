import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HELP_ANCHORS, helpLink } from '../lib/helpAnchors.ts'

const page = readFileSync(new URL('../app/help/page.tsx', import.meta.url), 'utf8')
// the name each answer on the page starts with, in page order
const onPage = [...page.matchAll(/^  \['([^']+)', /gm)].map((m) => m[1])

test('every Help answer has one fixed name, and the page uses them in order', () => {
  assert.deepEqual(onPage, [...HELP_ANCHORS])
  assert.equal(new Set(HELP_ANCHORS).size, HELP_ANCHORS.length)
})

test('a name is a plain word that can sit in an address, never a position', () => {
  for (const a of HELP_ANCHORS) {
    assert.match(a, /^[a-z]+(-[a-z]+)*$/, a)
    assert.equal(helpLink(a), `/help#${a}`)
  }
  assert.ok(!/#q\$\{|id=\{`q/.test(page), 'the page no longer numbers its answers')
})

test('links to one Help answer from other pages use a name that exists', () => {
  for (const f of ['../lib/guides.tsx', '../app/page.tsx']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
    const used = [...src.matchAll(/helpLink\('([^']+)'\)/g)].map((m) => m[1])
    assert.ok(used.length > 0, f)
    for (const u of used) assert.ok((HELP_ANCHORS as readonly string[]).includes(u), `${f}: ${u}`)
    assert.ok(!/\/help#/.test(src), `${f}: link an answer through helpLink`)
  }
})
