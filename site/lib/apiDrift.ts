// Compares the example answers on /docs/api with what the site really answers.
// Only field names are compared: values move all the time, names are the promise.

type Json = unknown
const isObj = (v: Json): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** An example as shown on the page, as data. "[ … ]" (a list cut short) reads as an empty list. */
export function parseExample(text: string): Json {
  return JSON.parse(text.replace(/\[\s*…\s*\]/g, '[]'))
}

/** Fields the example shows that the live answer does not have, as dotted paths. A list is judged by its first entry. */
export function missingFields(example: Json, live: Json, at = ''): string[] {
  if (Array.isArray(example)) {
    if (!Array.isArray(live)) return [`${at || '(answer)'}: not a list any more`]
    if (!example.length || !live.length) return []
    return missingFields(example[0], live[0], `${at}[]`)
  }
  if (isObj(example)) {
    if (!isObj(live)) return [`${at || '(answer)'}: not an object any more`]
    const out: string[] = []
    for (const k of Object.keys(example)) {
      const p = at ? `${at}.${k}` : k
      if (!(k in live)) out.push(p)
      else out.push(...missingFields(example[k], live[k], p))
    }
    return out
  }
  return []
}

/** Fields the live answer has that the example leaves out. Not an error (examples are shortened), only worth a look. */
export function extraFields(example: Json, live: Json, at = ''): string[] {
  if (Array.isArray(example) && Array.isArray(live)) return example.length && live.length ? extraFields(example[0], live[0], `${at}[]`) : []
  if (!isObj(example) || !isObj(live)) return []
  const out: string[] = []
  for (const k of Object.keys(live)) {
    const p = at ? `${at}.${k}` : k
    if (!(k in example)) out.push(p)
    else out.push(...extraFields(example[k], live[k], p))
  }
  return out
}

/** A CSV example against the live file: the heading line must be the same, and every example line must have as many columns. */
export function csvDrift(example: string, live: string): string[] {
  const ex = example.trim().split(/\r?\n/)
  const head = live.trim().split(/\r?\n/)[0] ?? ''
  const out: string[] = []
  if (ex[0] !== head) out.push(`heading line is now "${head}", the page shows "${ex[0]}"`)
  const n = ex[0].split(',').length
  ex.slice(1).forEach((l, i) => { if (l.split(',').length !== n) out.push(`example line ${i + 1} has ${l.split(',').length} columns, the heading has ${n}`) })
  return out
}

/** Every address the page documents with <Get path=…>, read from its source. */
export function documentedPaths(pageSource: string): string[] {
  const out: string[] = []
  for (const m of pageSource.matchAll(/<Get path=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
    out.push(m[1] ?? m[2].replace(/\$\{'([^']+)'\}/g, '$1'))
  }
  return out
}
