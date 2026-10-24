import { keccak_256 } from '@noble/hashes/sha3'
import { ed25519 } from '@noble/curves/ed25519'

/*
  Monero mainnet address check, the same rules the wXMR bridge enforces on
  chain (base58 blocks, Keccak-256 checksum, mainnet tag, valid ed25519 keys).
  Rejecting a bad address here saves a failed transaction.
*/

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const DIGIT = new Map([...ALPHABET].map((c, i) => [c, BigInt(i)]))
const U64 = (1n << 64n) - 1n
// encoded chars in a block -> decoded bytes
const BLOCK = { 0: 0, 2: 1, 3: 2, 5: 3, 6: 4, 7: 5, 9: 6, 10: 7, 11: 8 }

const TAGS = { 18: 'standard', 42: 'subaddress', 19: 'integrated' }


function decodeBlock(enc, out) {
  const size = BLOCK[enc.length]
  if (size === undefined || size !== out.length) return false
  let n = 0n
  let order = 1n
  for (let i = enc.length - 1; i >= 0; i--) {
    const d = DIGIT.get(enc[i])
    if (d === undefined) return false
    n += order * d
    if (n > U64) return false
    if (i) {
      order *= 58n
      if (order > U64) return false
    }
  }
  if (size < 8 && 1n << BigInt(8 * size) <= n) return false
  for (let j = size - 1; j >= 0; j--) {
    out[j] = Number(n & 0xffn)
    n >>= 8n
  }
  return true
}

export function base58Decode(enc) {
  const full = Math.floor(enc.length / 11)
  const last = BLOCK[enc.length % 11]
  if (last === undefined) return null
  const out = new Uint8Array(full * 8 + last)
  for (let i = 0; i < full; i++) if (!decodeBlock(enc.slice(i * 11, i * 11 + 11), out.subarray(i * 8, i * 8 + 8))) return null
  if (last && !decodeBlock(enc.slice(full * 11), out.subarray(full * 8))) return null
  return out
}

const CHARS = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7, 6: 9, 7: 10, 8: 11 } // decoded bytes in a block -> encoded chars
/** Monero's block base58: 8 bytes -> 11 chars, shorter last block padded with '1'. */
export function base58Encode(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 8) {
    const block = bytes.subarray(i, Math.min(i + 8, bytes.length))
    let n = 0n
    for (const b of block) n = (n << 8n) | BigInt(b)
    let enc = ''
    for (let k = 0; k < CHARS[block.length]; k++) { enc = ALPHABET[Number(n % 58n)] + enc; n /= 58n }
    out += enc
  }
  return out
}

function isPoint(bytes) {
  try {
    ed25519.ExtendedPoint.fromHex(bytes)
    return true
  } catch {
    return false
  }
}



export function checkMoneroAddress(input) {
  const a = input.trim()
  if (!a) return { ok: false, reason: 'Enter a Monero address' }
  if (a.length !== 95 && a.length !== 106) return { ok: false, reason: 'A Monero address is 95 characters (106 if integrated)' }
  const raw = base58Decode(a)
  if (!raw) return { ok: false, reason: 'Not a valid Monero address' }
  const kind = TAGS[raw[0]]
  if (!kind) return { ok: false, reason: 'Use a Monero mainnet address (starts with 4 or 8)' }
  const want = kind === 'integrated' ? 77 : 69
  if (raw.length !== want) return { ok: false, reason: 'Not a valid Monero address' }
  const body = raw.subarray(0, want - 4)
  const sum = keccak_256(body).subarray(0, 4)
  for (let i = 0; i < 4; i++) if (sum[i] !== raw[want - 4 + i]) return { ok: false, reason: 'Checksum mismatch: check for a typo' }
  if (!isPoint(raw.subarray(1, 33)) || !isPoint(raw.subarray(33, 65))) return { ok: false, reason: 'Not a valid Monero address' }
  return { ok: true, kind }
}
