'use client'

import { useEffect } from 'react'
import Lost from '@/components/Lost'

// Errors on the wallet pages stop here, so the wallet stays connected and "Try again" redraws only the page.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <Lost code={error.digest ? `Error ${error.digest}` : 'Error'} title="This page failed to load." action={<button className="btn btn-primary" onClick={reset}>Try again</button>}>
      Something broke while showing this page. Nothing leaves your wallet unless you approved it there, and an order that is already on Solana does not depend on this page staying open.
    </Lost>
  )
}
