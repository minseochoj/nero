import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PUBLIC_PATH, PUBLIC_TOC, xNetworks } from '../lib/whatIsPublic.ts'
import { HELP_ANCHORS } from '../lib/helpAnchors.ts'

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
const page = read('../app/what-is-public/page.tsx')

test('every section named in the list is on the page once, and nothing else is', () => {
  const onPage = [...page.matchAll(/<h2 id="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(onPage, PUBLIC_TOC.map(([id]) => id))
  assert.equal(new Set(onPage).size, onPage.length)
  for (const [id] of PUBLIC_TOC) assert.match(id, /^[a-z]+(-[a-z]+)*$/, id)
})

test('the networks come from the live asset list, without the slow chains or Solana', () => {
  assert.equal(xNetworks(), 'Base, Ethereum, Arbitrum, Optimism, Polygon or Avalanche')
})

test('only the standard exit is said to name the Monero address on Solana', () => {
  const parts = page.split(/<h2 id="/).slice(1)
  const standard = parts.find((p) => p.startsWith('standard"'))!
  assert.match(standard, /the Monero address you exit to/)
  for (const p of parts.filter((x) => /^(private|send-sol|other-assets)"/.test(x))) {
    assert.match(p, /Not on Solana|never sees your Monero address/, p.slice(0, 20))
  }
})

test('the page is in the sitemap, Help, the Paper, the footer and llms.txt', () => {
  assert.ok(read('../app/sitemap.ts').includes('PUBLIC_PATH'))
  assert.ok(read('../app/help/page.tsx').includes('PUBLIC_PATH'))
  assert.ok(read('../app/docs/page.tsx').includes(PUBLIC_PATH))
  assert.ok(read('../components/Shell.tsx').includes(PUBLIC_PATH))
  assert.ok(read('../public/llms.txt').includes(`https://www.neroswap.app${PUBLIC_PATH}`))
  assert.ok((HELP_ANCHORS as readonly string[]).includes('what-is-public'))
})
