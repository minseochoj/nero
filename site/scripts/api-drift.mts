// Asks the live site for every address documented on /docs/api and compares the field names
// with the example answers the page shows. Read-only GETs, about ten of them.
//   npm run drift                 (against neroswap.app)
//   npm run drift -- <base url>   (against another build)
// Exit 1 only on real drift. No network, or a part not answering, is reported and skipped.
import { DOCUMENTED } from '../lib/apiExamples.ts'
import { parseExample, missingFields, extraFields, csvDrift } from '../lib/apiDrift.ts'

const base = (process.argv[2] || 'https://www.neroswap.app').replace(/\/$/, '')
let drift = 0, checked = 0, skipped = 0

for (const d of DOCUMENTED) {
  let status = 0, body = ''
  try {
    const r = await fetch(base + d.path, { signal: AbortSignal.timeout(20_000), headers: { accept: d.kind === 'csv' ? 'text/csv' : 'application/json' } })
    status = r.status
    body = await r.text()
  } catch { /* no network, or no answer in time */ }
  if (!status || status >= 500) { skipped++; console.log(`skip   ${d.path}  (${status || 'no answer'})`); continue }
  checked++
  const problems: string[] = []
  let extra: string[] = []
  if (status !== 200) problems.push(`answers ${status}`)
  else if (d.kind === 'csv') problems.push(...csvDrift(d.example!, body))
  else {
    let live: unknown
    try { live = JSON.parse(body) } catch { problems.push('does not answer in JSON') }
    if (live !== undefined && d.example) {
      const ex = parseExample(d.example)
      problems.push(...missingFields(ex, live).map((f) => `the page shows "${f}", the answer does not have it`))
      extra = extraFields(ex, live)
    }
  }
  if (problems.length) { drift++; console.log(`DRIFT  ${d.path}`); for (const p of problems) console.log(`         ${p}`) }
  else console.log(`ok     ${d.path}${extra.length ? `  (not in the example: ${extra.join(', ')})` : ''}`)
}

if (!checked) console.log(`\n${base} is not answering from here: nothing checked.`)
else console.log(`\n${checked} checked, ${skipped} skipped, ${drift} drifted.`)
process.exit(drift ? 1 : 0)
