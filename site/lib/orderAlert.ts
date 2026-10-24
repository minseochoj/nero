/*
  What the browser says when an order you are watching ends. Kept apart from the component so the rules can be
  tested offline. Nothing here carries an amount, an address or a transaction id: a notification can sit on a lock
  screen.
*/
export type Outcome = 'paid' | 'refunded' | 'failed'

export const ALERT: Record<Outcome, { title: string; head: string; body: string }> = {
  paid: { title: 'XMR sent', head: 'Your XMR was sent', body: 'Open Nero for the payment proof.' },
  refunded: { title: 'Refunded', head: 'Your exit was refunded', body: 'Open Nero to see why.' },
  failed: { title: 'Did not go through', head: 'Your exit did not go through', body: 'Nothing moved. Open Nero for details.' },
}

export function tabTitle(base: string, outcome: Outcome | null): string {
  return outcome ? `${ALERT[outcome].title} · ${base}` : base
}

/*
  A notification is only for an ending that happened while this page was watching: the order was seen in progress
  first, the tab is in the background, and the user has already said yes. Opening the link of an order that is
  already finished stays quiet.
*/
export function shouldNotify(v: { sawPending: boolean; outcome: Outcome | null; hidden: boolean; permission: string; already: boolean }): boolean {
  return !!v.outcome && v.sawPending && v.hidden && v.permission === 'granted' && !v.already
}

/* Ask only once an order exists and is still in progress, and only if the browser has not been answered before. */
export function canOffer(v: { known: boolean; outcome: Outcome | null; supported: boolean; permission: string }): boolean {
  return v.known && !v.outcome && v.supported && v.permission === 'default'
}
