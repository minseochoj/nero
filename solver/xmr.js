// monero-wallet-rpc client (HTTP digest auth, MD5, qop=auth). Local only: 127.0.0.1.
import { createHash, randomBytes } from 'crypto'

const md5 = (s) => createHash('md5').update(s).digest('hex')

export function walletRpc({ url = 'http://127.0.0.1:18083/json_rpc', user, pass, timeoutMs = 60_000, file = 'solver', filePass = '' }) {
  let chal = null, nc = 0
  const authHeader = () => {
    if (!chal) return {}
    nc++
    const ncs = nc.toString(16).padStart(8, '0'), cnonce = randomBytes(8).toString('hex'), uri = new URL(url).pathname
    const ha1 = md5(`${user}:${chal.realm}:${pass}`), ha2 = md5(`POST:${uri}`)
    const response = md5(`${ha1}:${chal.nonce}:${ncs}:${cnonce}:auth:${ha2}`)
    // epee (monero's HTTP server) only accepts the fields in this order: algorithm last, as curl sends them
    return { authorization: `Digest username="${user}", realm="${chal.realm}", nonce="${chal.nonce}", uri="${uri}", cnonce="${cnonce}", nc=${ncs}, qop=auth, response="${response}", algorithm=MD5` }
  }
  async function call(method, params = {}) {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 0, method, params })
    // epee's digest check counts nonce uses its own way: a correct response can still get a 401 for its nc value,
    // so on 401 we retry with the next nc against the same nonce.
    for (let attempt = 0; attempt < 6; attempt++) {
      // a hung wallet must not freeze the solver; a timed-out transfer is treated as 'outcome unknown' (stuck) upstream
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeader() }, body, signal: AbortSignal.timeout(method === 'transfer' ? 180_000 : timeoutMs) })
      if (r.status === 401) {
        await r.text()
        const h = r.headers.get('www-authenticate') || ''
        const get = (k) => (h.match(new RegExp(`${k}="([^"]+)"`)) || [])[1]
        const nonce = get('nonce')
        // keep the first nonce and keep counting; only a stale=true answer means take the new one
        if (!chal || /stale=true/i.test(h)) { chal = { realm: get('realm'), nonce }; nc = 0 }
        continue
      }
      const j = await r.json()
      // the wallet service restarted and has no wallet open: open ours and retry once
      if (j.error && /No wallet file/i.test(j.error.message) && method !== 'open_wallet' && filePass && attempt < 5) {
        await call('open_wallet', { filename: file, password: filePass }); await call('auto_refresh', { enable: true, period: 20 }); continue
      }
      if (j.error) { const e = new Error(`wallet ${method}: ${j.error.message}`); e.code = j.error.code; e.walletMessage = j.error.message; throw e }
      return j.result
    }
    throw new Error(`wallet ${method}: unauthorized`)
  }
  return {
    call,
    balance: async () => { const b = await call('get_balance', { account_index: 0 }); return { total: BigInt(b.balance), unlocked: BigInt(b.unlocked_balance) } },
    height: async () => (await call('get_height')).height,
    validate: async (address) => (await call('validate_address', { address, any_net_type: false })).valid,
    /** Unlocked, unspent outputs (pico amounts), biggest first. */
    outputs: async () => {
      const r = await call('incoming_transfers', { transfer_type: 'available', account_index: 0 })
      return (r.transfers || []).filter((t) => t.unlocked && !t.spent && !t.frozen).map((t) => BigInt(t.amount)).sort((a, b) => (a < b ? 1 : -1))
    },
    /** Split one big output into `pieces` equal outputs back to ourselves, so several payouts can go out in a row. */
    split: async (address, piecePico, pieces) => {
      const r = await call('transfer', { destinations: Array.from({ length: pieces }, () => ({ amount: Number(piecePico), address })), account_index: 0, priority: 0 })
      return { txHash: r.tx_hash, fee: String(r.fee) }
    },
    /** Pay one destination. Returns { txHash, txKey, fee }. */
    pay: async (address, pico) => {
      const r = await call('transfer', { destinations: [{ amount: Number(pico) <= Number.MAX_SAFE_INTEGER ? Number(pico) : pico.toString(), address }], account_index: 0, priority: 0, get_tx_key: true })
      return { txHash: r.tx_hash, txKey: r.tx_key, fee: String(r.fee) }
    },
  }
}

/** Errors that prove the transfer was NOT created, so the order can safely be refunded instead. */
export const definitelyNotSent = (e) => /not enough (unlocked )?money|not enough money|Invalid destination address|invalid address|transaction would be too large|No unlocked balance/i.test(e?.walletMessage || '')
