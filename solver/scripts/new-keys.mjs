// Makes a fresh set of solver keys in a directory that must not exist yet, so nothing is ever overwritten.
//   node scripts/new-keys.mjs /opt/nero/keys
// Writes deposit.json (the Solana deposit wallet), fee-owner.json (owner of the standard exit's fee account) and
// secrets.env (box secret, one-time address seed, admin secret). Prints the public values the site pins.
import { mkdirSync, existsSync, writeFileSync } from 'fs'
import { randomBytes } from 'crypto'
import { Keypair } from '@solana/web3.js'
import nacl from 'tweetnacl'

const dir = process.argv[2]
if (!dir) { console.error('usage: node scripts/new-keys.mjs <new directory>'); process.exit(1) }
if (existsSync(dir)) { console.error(`${dir} already exists: refusing to overwrite keys`); process.exit(1) }
mkdirSync(dir, { recursive: true, mode: 0o700 })

const deposit = Keypair.generate()
const feeOwner = Keypair.generate()
const box = nacl.box.keyPair()
const w = (name, body) => writeFileSync(`${dir}/${name}`, body, { mode: 0o600 })

w('deposit.json', JSON.stringify(Array.from(deposit.secretKey)))
w('fee-owner.json', JSON.stringify(Array.from(feeOwner.secretKey)))
w('secrets.env', [
  `SOLVER_KEY_FILE=${dir}/deposit.json`,
  `SOLVER_BOX_SECRET=${Buffer.from(box.secretKey).toString('base64')}`,
  `SOLVER_ADDR_SEED=${randomBytes(32).toString('hex')}`,
  `SOLVER_ADMIN_SECRET=${randomBytes(24).toString('hex')}`,
  '',
].join('\n'))

console.log(JSON.stringify({
  deposit: deposit.publicKey.toBase58(),
  boxPub: Buffer.from(box.publicKey).toString('base64'),
  feeOwner: feeOwner.publicKey.toBase58(),
}, null, 2))
