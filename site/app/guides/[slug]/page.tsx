import Link from 'next/link'
import { notFound } from 'next/navigation'
import GuideQuote from '@/components/GuideQuote'
import { GUIDES, guide } from '@/lib/guides'
import { pageMeta } from '@/lib/meta'

export const dynamicParams = false
export const generateStaticParams = () => GUIDES.map((g) => ({ slug: g.slug }))

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const g = guide((await params).slug)
  return g ? pageMeta(g.metaTitle, g.description, `/guides/${g.slug}`) : {}
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = guide((await params).slug)
  if (!g) notFound()
  return (
    <div className="wrap doc">
      <nav className="doc-toc">
        {g.steps.map(([h], i) => <a key={h} href={`#step${i + 1}`}>{i + 1}. {h}</a>)}
        {g.notes.map(([h], i) => <a key={h} href={`#note${i + 1}`}>{h}</a>)}
      </nav>
      <article>
        <p className="kicker"><Link href="/guides">Guides</Link></p>
        <h1>{g.title}</h1>
        <p>{g.intro}</p>
        {g.quote ? <GuideQuote kind={g.quote} href={g.cta.href} label={g.cta.label} /> : <p><Link href={g.cta.href} className="btn btn-primary btn-lg">{g.cta.label}</Link></p>}
        {g.steps.map(([h, body], i) => (
          <section key={h}>
            <h2 id={`step${i + 1}`}><span className="step-n">{String(i + 1).padStart(2, '0')}</span>{h}</h2>
            <p>{body}</p>
          </section>
        ))}
        {g.notes.map(([h, body], i) => (
          <section key={h}>
            <h2 id={`note${i + 1}`}>{h}</h2>
            <p>{body}</p>
          </section>
        ))}
        <nav className="guide-more" aria-label="More guides">
          {GUIDES.filter((o) => o.slug !== g.slug).map((o) => <Link key={o.slug} href={`/guides/${o.slug}`}>{o.title.replace(/\.$/, '')}<span aria-hidden="true">→</span></Link>)}
          <Link href="/docs">How it all works: the Paper<span aria-hidden="true">→</span></Link>
        </nav>
      </article>
    </div>
  )
}
