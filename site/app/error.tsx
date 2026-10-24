'use client'

import { useEffect } from 'react'
import Lost from '@/components/Lost'

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <Lost code={error.digest ? `Error ${error.digest}` : 'Error'} title="This page failed to load." action={<button className="btn btn-primary" onClick={reset}>Try again</button>}>
      Something broke while showing this page. It is a display problem only. Try again, or check the status page to see if a route is down.
    </Lost>
  )
}
