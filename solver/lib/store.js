// Durable state: atomic JSON writes (tmp + rename) and append-only JSONL ledgers that are never truncated.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'

export function createStore(dir) {
  mkdirSync(dir, { recursive: true })
  const p = (name) => join(dir, name)

  function readJson(name, fallback) {
    if (!existsSync(p(name))) return structuredClone(fallback)
    try {
      return JSON.parse(readFileSync(p(name), 'utf8'))
    } catch (e) {
      // a corrupt state file must stop money movement, not silently reset to empty
      throw new Error(`state file ${name} is unreadable: ${e.message}`)
    }
  }
  function writeJson(name, value) {
    const tmp = p(`${name}.tmp`)
    writeFileSync(tmp, JSON.stringify(value, null, 1))
    renameSync(tmp, p(name))
  }
  function append(name, row) {
    appendFileSync(p(name), JSON.stringify({ at: Math.floor(Date.now() / 1000), ...row }) + '\n')
  }
  function tail(name, n = 100) {
    if (!existsSync(p(name))) return []
    const lines = readFileSync(p(name), 'utf8').split('\n').filter(Boolean)
    const out = []
    for (const l of lines.slice(-n)) {
      try { out.push(JSON.parse(l)) } catch {}
    }
    return out.reverse()
  }
  function all(name) {
    return tail(name, Number.MAX_SAFE_INTEGER)
  }
  return { readJson, writeJson, append, tail, all, path: p }
}
