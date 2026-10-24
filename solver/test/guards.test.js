import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Keypair } from '@solana/web3.js'
import { checkMoneroAddress } from '../lib/monero.js'
import { eventsFromLogs, nextNonce, requestWithdrawalIx, withdrawalPda } from '../lib/bridge.js'
import { provenAbsent, sendSafe, timing } from '../lib/chain.js'

const SUB = '82wez4jsocbZf9DAYmM5HsbKre6pnE5LuSCnbAwVJDTKKYEfuvKeacaTgRddrJvVSBB6PwisuYtNvZes37G2PVJ3EKWgJYX'

test('monero: real subaddress ok, typo / wrong length / solana key rejected', () => {
  assert.deepEqual(checkMoneroAddress(SUB), { ok: true, kind: 'subaddress' })
  assert.equal(checkMoneroAddress(SUB.slice(0, -1) + 'Z').ok, false)
  assert.equal(checkMoneroAddress(SUB.slice(1)).ok, false)
  assert.equal(checkMoneroAddress('5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9').ok, false)
  assert.equal(checkMoneroAddress('').ok, false)
})

test('bridge: nonce rises above the watermark; ix encodes the address at byte 28', () => {
  assert.equal(nextNonce(null, 5), 5n)
  assert.equal(nextNonce(10n, 5), 11n)
  assert.equal(nextNonce(3n, 1000), 1000n)
  const u = Keypair.generate().publicKey
  const ix = requestWithdrawalIx(u, 42n, 123n, SUB)
  assert.equal(ix.data.subarray(28, 28 + SUB.length).toString(), SUB)
  assert.equal(ix.data.readBigUInt64LE(16), 123n)
  assert.ok(ix.keys[1].pubkey.equals(withdrawalPda(u, 42n)))
  assert.equal(ix.data[ix.data.length - 1], 0)
})

test('bridge: decodes a real WithdrawCompleted log line', () => {
  // from tx 5de3miWSbX… (2026-10-07), rebuilt from the decoded fields
  const parts = [
    Buffer.from([192, 162, 40, 197, 83, 94, 198, 66]),
    Keypair.generate().publicKey.toBuffer(), Keypair.generate().publicKey.toBuffer(),
    (() => { const b = Buffer.alloc(8); b.writeBigUInt64LE(4508883556473n); return b })(),
  ]
  const str = (s) => { const b = Buffer.from(s); const l = Buffer.alloc(4); l.writeUInt32LE(b.length); return Buffer.concat([l, b]) }
  const data = Buffer.concat([...parts, str(SUB), str('9cc3'), str('9639')]).toString('base64')
  const [e] = eventsFromLogs(['Program log: x', `Program data: ${data}`])
  assert.equal(e.kind, 'completed')
  assert.equal(e.amount, 4508883556473n)
  assert.equal(e.xmrAddress, SUB)
})

function fakeConn({ statuses = [null], confirmedHeight = 0, finalizedHeight = 0, txByFinalized = null, failStatusAfter = Infinity }) {
  let calls = 0
  return {
    sendRawTransaction: async () => 'sig',
    getSignatureStatuses: async () => {
      if (calls >= failStatusAfter) throw new Error('429')
      return { value: [statuses[Math.min(calls++, statuses.length - 1)]] }
    },
    getBlockHeight: async (c) => (c === 'finalized' ? finalizedHeight : confirmedHeight),
    getTransaction: async () => txByFinalized,
  }
}
const built = { tx: { serialize: () => Buffer.alloc(1) }, lastValidBlockHeight: 10, sig: 'sig' }

test('sendSafe and provenAbsent need positive proof before calling a send dead', async () => {
  let t = 0
  timing.sleep = async (ms) => { t += ms }
  timing.now = () => t
  const ok = { confirmationStatus: 'confirmed', err: null }
  assert.equal((await sendSafe(fakeConn({ statuses: [null, ok] }), built)).status, 'confirmed')
  assert.equal((await sendSafe(fakeConn({ statuses: [{ confirmationStatus: 'confirmed', err: { x: 1 } }] }), built)).status, 'failed')
  // expired, finalized far past expiry, nothing anywhere: not landed
  assert.equal((await sendSafe(fakeConn({ confirmedHeight: 500, finalizedHeight: 500 }), built)).status, 'not_landed')
  // expired by confirmed height but finality not past it yet: never "not landed"
  assert.equal((await sendSafe(fakeConn({ confirmedHeight: 500, finalizedHeight: 100 }), built)).status, 'ambiguous')
  // finalized getTransaction finds it: landed
  assert.equal((await sendSafe(fakeConn({ confirmedHeight: 500, finalizedHeight: 500, txByFinalized: { meta: { err: null } } }), built)).status, 'confirmed')
  // seen but stuck at processed: ambiguous
  assert.equal((await sendSafe(fakeConn({ statuses: [{ confirmationStatus: 'processed', err: null }], confirmedHeight: 500, finalizedHeight: 500 }), built)).status, 'ambiguous')
  // RPC errors are never proof of absence
  assert.equal(await provenAbsent(fakeConn({ finalizedHeight: 500, failStatusAfter: 0 }), 'sig', 10), 'unknown')
  assert.equal(await provenAbsent(fakeConn({ finalizedHeight: 500 }), 'sig', 0), 'unknown')
  assert.equal(await provenAbsent(fakeConn({ finalizedHeight: 500 }), 'sig', 10), 'absent')
})
