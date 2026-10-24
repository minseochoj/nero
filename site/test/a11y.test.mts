import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { listTarget, rowTarget } from '../lib/a11y.ts'

test('a row of tabs wraps around with the arrows', () => {
  assert.equal(rowTarget('ArrowRight', 0, 3), 1)
  assert.equal(rowTarget('ArrowRight', 2, 3), 0)
  assert.equal(rowTarget('ArrowLeft', 0, 3), 2)
  assert.equal(rowTarget('ArrowDown', 1, 3), 2)
  assert.equal(rowTarget('ArrowUp', 1, 3), 0)
})

test('Home and End jump to the ends of a row', () => {
  assert.equal(rowTarget('Home', 2, 3), 0)
  assert.equal(rowTarget('End', 0, 3), 2)
})

test('other keys, and an empty row, are left alone', () => {
  for (const k of ['Enter', ' ', 'Tab', 'Escape', 'a']) assert.equal(rowTarget(k, 0, 3), -1)
  assert.equal(rowTarget('ArrowRight', 0, 0), -1)
  assert.equal(listTarget('ArrowDown', 0, 0), -1)
  assert.equal(listTarget('Enter', 0, 5), -1)
})

test('a row whose current choice is unknown starts from the first', () => {
  assert.equal(rowTarget('ArrowRight', -1, 3), 1)
  assert.equal(rowTarget('ArrowLeft', -1, 3), 2)
})

test('the token list stops at both ends instead of wrapping', () => {
  assert.equal(listTarget('ArrowDown', 0, 4), 1)
  assert.equal(listTarget('ArrowDown', 3, 4), 3)
  assert.equal(listTarget('ArrowUp', 0, 4), 0)
  assert.equal(listTarget('ArrowUp', 2, 4), 1)
  assert.equal(listTarget('Home', 3, 4), 0)
  assert.equal(listTarget('End', 0, 4), 3)
})

// WCAG 2 contrast of the text colours against every surface they sit on (AA for body text is 4.5)
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const token = (name: string) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  assert.ok(m, `--${name} is a hex colour in globals.css`)
  return m![1]
}
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

test('every text colour reads at 4.5:1 or better on every surface', () => {
  for (const fg of ['text', 'muted', 'faint', 'xmr', 'ok', 'warn', 'bad']) {
    for (const bg of ['bg', 'bg-2', 'bg-3']) {
      const r = ratio(token(fg), token(bg))
      assert.ok(r >= 4.5, `--${fg} on --${bg} is ${r.toFixed(2)}:1`)
    }
  }
})

test('keyboard focus is drawn, and motion can be turned off', () => {
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*2px solid/)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
})
