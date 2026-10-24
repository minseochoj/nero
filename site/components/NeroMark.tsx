/*
  The Nero mark: an eclipse drawn as one flat crescent. Two circles of radius 30, the second shifted 6.6 down-left
  (22% of the radius); the crescent is what the first circle keeps outside the second. The view box is centred on
  the crescent itself, not on the circle, so it sits optically centred. Same geometry as brand/logo.png.
*/
export const MARK_PATH = 'M26.58 31.25 A30 30 0 1 1 68.75 73.42 A30 30 0 0 0 26.58 31.25 Z'
export const MARK_VIEW = '23.3 16.7 60 60'

export default function NeroMark({ size = 22, color = 'var(--xmr)' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox={MARK_VIEW} aria-hidden="true">
      <path d={MARK_PATH} fill={color} />
    </svg>
  )
}
