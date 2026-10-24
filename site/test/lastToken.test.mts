import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLastToken, pickerRows, mayUseRemembered } from '../lib/lastToken.ts'
import { EXIT_TOKENS } from '../lib/tokens.ts'

const SOL = EXIT_TOKENS[0]
const USDC = EXIT_TOKENS[1]
const JUP = { symbol: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6, icon: 'https://static.jup.ag/jup/icon.png', name: 'Jupiter', verified: true }

test('a stored token comes back as it was saved', () => {
  assert.deepEqual(parseLastToken(JSON.stringify(JUP)), JUP)
})

test('nothing stored, or something unreadable, is no token', () => {
  for (const s of [null, undefined, '', 'not json', 'null', '[]', '"SOL"', '{}', '{"mint":5}']) assert.equal(parseLastToken(s as any), null)
})

test('a shortcut always comes from our own list, whatever else was stored with it', () => {
  const got = parseLastToken(JSON.stringify({ mint: USDC.mint, symbol: 'FREE MONEY', decimals: 2, icon: 'https://evil.example/x.png' }))
  assert.deepEqual(got, { ...USDC })
})

test('a bad address, ticker or decimals is refused', () => {
  const bad = [
    { ...JUP, mint: 'short' },
    { ...JUP, mint: `${JUP.mint}0` }, // 0 is not in the alphabet
    { ...JUP, mint: 'O'.repeat(40) },
    { ...JUP, symbol: '' },
    { ...JUP, symbol: 7 },
    { ...JUP, decimals: '6' },
    { ...JUP, decimals: 6.5 },
    { ...JUP, decimals: 0 },
    { ...JUP, decimals: 19 },
  ]
  for (const b of bad) assert.equal(parseLastToken(JSON.stringify(b)), null, JSON.stringify(b))
})

test('an image address that is not https or our own is dropped, the token is kept', () => {
  for (const icon of ['javascript:alert(1)', 'http://plain.example/a.png', 'data:image/png;base64,AAAA', '//other.example/a.png', '/api/secret', 'https://a.example/x.png" onerror="x', 5]) {
    const got = parseLastToken(JSON.stringify({ ...JUP, icon }))
    assert.equal(got?.mint, JUP.mint)
    assert.equal(got?.icon, undefined, String(icon))
  }
  assert.equal(parseLastToken(JSON.stringify({ ...JUP, icon: '/img/sol.webp' }))?.icon, '/img/sol.webp')
})

test('long text is cut and extra fields are left behind', () => {
  const got = parseLastToken(JSON.stringify({ ...JUP, symbol: 'X'.repeat(80), name: 'N'.repeat(200), verified: 'yes', wallet: 'abc', amount: '12' }))!
  assert.equal(got.symbol.length, 20)
  assert.equal(got.name!.length, 60)
  assert.equal(got.verified, undefined)
  assert.deepEqual(Object.keys(got).sort(), ['decimals', 'icon', 'mint', 'name', 'symbol', 'verified'])
})

test('a link that names a token or an amount is not overridden', () => {
  assert.equal(mayUseRemembered(''), true)
  assert.equal(mayUseRemembered('?tab=exit'), true)
  assert.equal(mayUseRemembered(`?in=${SOL.mint}`), false)
  assert.equal(mayUseRemembered('?amount=1'), false)
  assert.equal(mayUseRemembered(`?tab=exit&in=${USDC.mint}&amount=250`), false)
})

test('the list with no wallet and nothing remembered is the shortcuts, with no heading', () => {
  const rows = pickerRows(null, [], EXIT_TOKENS)
  assert.deepEqual(rows.map((r) => r.t.symbol), ['SOL', 'USDC', 'USDT'])
  assert.ok(rows.every((r) => !r.head))
})

test('the last used token is offered first and never twice', () => {
  const rows = pickerRows(JUP, [], EXIT_TOKENS)
  assert.deepEqual(rows.map((r) => [r.t.symbol, r.head]), [['JUP', 'Last used'], ['SOL', 'Common'], ['USDC', undefined], ['USDT', undefined]])
  const again = pickerRows({ ...USDC }, [], EXIT_TOKENS)
  assert.deepEqual(again.map((r) => [r.t.symbol, r.head]), [['USDC', 'Last used'], ['SOL', 'Common'], ['USDT', undefined]])
})

test('with a wallet, the last used row carries the wallet balance and the rest keep their order', () => {
  const mine = [{ ...SOL, bal: '2.5' }, { ...JUP, bal: '1,000' }, { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5, bal: '9' }]
  const rows = pickerRows(JUP as any, mine as any, EXIT_TOKENS as any)
  assert.deepEqual(rows.map((r) => [r.t.symbol, r.head]), [
    ['JUP', 'Last used'], ['SOL', 'In your wallet'], ['BONK', undefined], ['USDC', 'Common'], ['USDT', undefined],
  ])
  assert.equal((rows[0].t as any).bal, '1,000')
})

test('with a wallet and nothing remembered, the headings are as before', () => {
  const mine = [{ ...SOL, bal: '2.5' }]
  const rows = pickerRows(null, mine as any, EXIT_TOKENS as any)
  assert.deepEqual(rows.map((r) => [r.t.symbol, r.head]), [['SOL', 'In your wallet'], ['USDC', 'Common'], ['USDT', undefined]])
})
