import type { KeyboardEvent } from 'react'

/*
  Keyboard rules shared by the tab rows, the option rows and the token list.
  The pure parts are tested offline in test/a11y.test.mts.
*/

/** Where an arrow key lands in a row of `count` choices that wraps around; -1 when the key is not ours. */
export function rowTarget(key: string, index: number, count: number): number {
  if (count <= 0) return -1
  const i = index < 0 ? 0 : index
  if (key === 'ArrowRight' || key === 'ArrowDown') return (i + 1) % count
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (i - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return -1
}

/** Where an arrow key lands in a list of `count` rows that stops at both ends; -1 when the key is not ours. */
export function listTarget(key: string, index: number, count: number): number {
  if (count <= 0) return -1
  if (key === 'ArrowDown') return Math.min(index + 1, count - 1)
  if (key === 'ArrowUp') return Math.max(index - 1, 0)
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return -1
}

/**
 * onKeyDown for a row of tabs or radio buttons where only the chosen one is a tab stop:
 * the arrows, Home and End move the choice and the focus together.
 */
export function rowKeys<T>(order: readonly T[], current: T, choose: (t: T) => void, role: 'tab' | 'radio') {
  return (e: KeyboardEvent<HTMLElement>) => {
    const n = rowTarget(e.key, order.indexOf(current), order.length)
    if (n < 0) return
    e.preventDefault()
    choose(order[n])
    e.currentTarget.querySelectorAll<HTMLElement>(`[role="${role}"]`)[n]?.focus()
  }
}
