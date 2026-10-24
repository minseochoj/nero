import { PUBLIC_LINE, STILL_PUBLIC, sidePublicLink, sideText, type SideView } from '@/lib/swapSide'

/** The text beside the swap form: a heading, three steps and the facts for whatever the form is showing. */
export default function SwapSide({ view }: { view: SideView }) {
  const t = sideText(view)
  return (
    <aside className="term-side">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 className="h-1">{t.heading}</h1>
        <p className="lead">{t.lead}</p>
      </div>
      <div className="flow">
        {t.steps.map((s) => (
          <div key={s.title} className={s.hot ? 'hot' : undefined}><b>{s.title}</b><p>{s.text}</p></div>
        ))}
      </div>
      <dl className="ledger">
        {t.facts.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            {/* a new tab, so whatever is typed in the form stays */}
            <dd>{v}{k === STILL_PUBLIC && <>. <a className="link" href={sidePublicLink(view)} target="_blank" rel="noopener">{PUBLIC_LINE}</a></>}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}
