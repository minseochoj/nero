import { helpLink } from '@/lib/helpAnchors'
import { HELP_LINE, orderHelp } from '@/lib/orderHelp'
import type { OrderKind } from '@/lib/orderLink'

/*
  Sits under the status of an order that was refunded or is being checked by hand: the way to the one Help answer
  about that state. It opens in a new tab so the order page stays where it is.
*/
export default function OrderHelp({ kind, status }: { kind: OrderKind; status: string | null | undefined }) {
  const a = orderHelp(kind, status)
  if (!a) return null
  return (
    <p className="hint" style={{ margin: 0 }}>
      <a className="link" href={helpLink(a)} target="_blank" rel="noopener">{HELP_LINE[a]}</a>
      {' '}in Help.
    </p>
  )
}
