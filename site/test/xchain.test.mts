import { test } from 'node:test'
import assert from 'node:assert/strict'
import { X_ASSETS, checkRefund, roundUpUnits, routeStage, unitsToDecimal, xAsset } from '../lib/xchain.ts'

test('the asset list has no duplicates and only known kinds', () => {
  assert.equal(new Set(X_ASSETS.map((a) => a.id)).size, X_ASSETS.length)
  assert.equal(new Set(X_ASSETS.map((a) => `${a.chain}:${a.symbol}`)).size, X_ASSETS.length)
  for (const a of X_ASSETS) assert.ok(['evm', 'tron', 'btc', 'zec', 'ltc', 'doge', 'sol'].includes(a.kind))
  for (const a of X_ASSETS) assert.equal(!!a.float, !['evm', 'tron', 'sol'].includes(a.kind)) // slow chains never lock a rate; fast ones always do
  assert.equal(checkRefund('sol', 'BGoyuZjKWwajN9U5q5xgFcPB5CER6vpYoL1fpCyzKvvv').ok, true)
  assert.equal(checkRefund('sol', '0xd8da6bf26964af9d7eed9e03e53415d37aa96045').ok, false)
  assert.equal(xAsset('nep141:base.omft.near')?.symbol, 'ETH')
  assert.equal(xAsset('nep141:sol.omft.near'), null) // Solana itself is not an "other chain"
  assert.equal(xAsset(''), null)
})

test('refund addresses are checked in the form their network uses', () => {
  const evm = checkRefund('evm', ' 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 ')
  assert.deepEqual(evm, { ok: true, value: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' }) // a correctly capitalised address passes its checksum and is sent lower-case
  assert.equal(checkRefund('evm', '0xd8da6bf26964af9d7eed9e03e53415d37aa96045').ok, true)   // all lower-case carries no checksum: accepted
  assert.equal(checkRefund('evm', '0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045').ok, true)   // all capitals too
  assert.equal(checkRefund('evm', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96054').ok, false)  // two characters swapped: the capitals no longer match
  assert.equal(checkRefund('evm', '0xD8dA6BF26964aF9D7eEd9e03E53415D37aA96045').ok, false)  // one letter in the wrong case
  assert.equal(checkRefund('evm', '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed').ok, true)   // a published EIP-55 example
  assert.equal(checkRefund('evm', '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359').ok, true)   // another
  assert.equal(checkRefund('evm', '0x123').ok, false)
  assert.equal(checkRefund('evm', '5GDP6viv4mK1XE2RBtdLoz3ct65YFjq6yfFoqXBi7bbk').ok, false) // a Solana address is not a refund address here
  assert.equal(checkRefund('evm', '0xZZdA6BF26964aF9D7eEd9e03E53415D37aA96045').ok, false)
  assert.equal(checkRefund('tron', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t').ok, true)
  assert.equal(checkRefund('tron', '0xd8da6bf26964af9d7eed9e03e53415d37aa96045').ok, false)
})

test('route stages: nothing is called finished unless the route says so', () => {
  assert.equal(routeStage('SUCCESS'), 'arrived')
  assert.equal(routeStage('PROCESSING'), 'crossing')
  assert.equal(routeStage('KNOWN_DEPOSIT_TX'), 'crossing')
  assert.equal(routeStage('REFUNDED'), 'refunded')
  assert.equal(routeStage('FAILED'), 'failed')
  for (const s of ['PENDING_DEPOSIT', 'INCOMPLETE_DEPOSIT', 'SOMETHING_NEW', '', undefined]) assert.equal(routeStage(s), 'waiting')
})

test('amounts are shown exactly, without rounding', () => {
  assert.equal(unitsToDecimal('8901852707878310', 18), '0.00890185270787831')
  assert.equal(unitsToDecimal('30000000', 6), '30')
  assert.equal(unitsToDecimal('1', 18), '0.000000000000000001')
  assert.equal(unitsToDecimal(1500000n, 6), '1.5')
  assert.equal(unitsToDecimal('0', 6), '0')
})

test('the amount to send is rounded up, never down', () => {
  assert.equal(roundUpUnits('5996593101274900', 18), 5997000000000000n)   // 0.0059965931012749 ETH -> 0.005997
  assert.equal(roundUpUnits('5997000000000000', 18), 5997000000000000n)   // already round: unchanged
  assert.equal(roundUpUnits('30004101', 6), 30010000n)                    // 30.004101 USDC -> 30.01
  assert.equal(roundUpUnits('30000000', 6), 30000000n)
  for (const [u, d] of [['1', 18], ['999999999999999999', 18], ['123456', 6], ['1', 6]] as const) assert.ok(roundUpUnits(u, d) >= BigInt(u))
})

test('refund addresses on the slow chains', () => {
  assert.deepEqual(checkRefund('btc', 'BC1QXY2KGDYGJRSQTZQ2N0YRF2493P83KKFJHX0WLH'), { ok: true, value: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' })
  assert.equal(checkRefund('btc', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa').ok, true)
  assert.equal(checkRefund('btc', '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy').ok, true)
  assert.equal(checkRefund('btc', '0xd8da6bf26964af9d7eed9e03e53415d37aa96045').ok, false)
  assert.equal(checkRefund('btc', 'ltc1qg42tkwuuxefutzxezdkdel39gfstuap288mfea').ok, false)   // a Litecoin address is not a Bitcoin address
  assert.equal(checkRefund('zec', 't1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs').ok, true)
  assert.equal(checkRefund('zec', 'zs1z7rejlpsa98s2rrrfkwmaxu53e4ue0ulcrw0h4x5g8jl04tak0d3mm47vdtahatqrlkngh9sly').ok, false) // shielded: the route cannot refund there
  assert.equal(checkRefund('ltc', 'ltc1qg42tkwuuxefutzxezdkdel39gfstuap288mfea').ok, true)
  assert.equal(checkRefund('ltc', 'LaMT348PWRnrqeeWArpwQPbuanpXDZGEUz').ok, true)
  assert.equal(checkRefund('doge', 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L').ok, true)
  assert.equal(checkRefund('doge', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh').ok, false)
})
