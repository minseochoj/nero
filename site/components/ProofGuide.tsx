import { PROOF_GUIDE } from '@/lib/orderLink'

/*
  Sits under a paid order's "Tx key (proof)" line: the way to the guide that shows how to check the payment in a
  Monero wallet. It opens in a new tab so the order page, and the proof on it, stays where it is.
*/
export default function ProofGuide() {
  return (
    <p className="hint" style={{ margin: 0 }}>
      <a className="link" href={PROOF_GUIDE} target="_blank" rel="noopener">How to check this proof yourself</a>
      {' '}in a Monero wallet, with the tx, the key and your address.
    </p>
  )
}
