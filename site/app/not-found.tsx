import type { Metadata } from 'next'
import Lost from '@/components/Lost'

export const metadata: Metadata = { title: 'Page not found', description: 'This page does not exist on Nero.' }

export default function NotFound() {
  return (
    <Lost code="404" title="Nothing at this address.">
      The link may be old or mistyped. If you were looking for an order, open it from the recent exits list on the swap page, in the browser that created it.
    </Lost>
  )
}
