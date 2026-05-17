import { useEffect } from 'react'
import type React from 'react'

/**
 * Close a popover when the user clicks outside it or presses Escape.
 *
 * The `ref` MUST cover both the trigger and the menu — otherwise the
 * first click on the trigger fires `onClose`, the menu reopens via
 * the trigger's own click handler, and the popover toggles infinitely.
 * Wrap trigger + menu in a single root element and pass its ref.
 *
 * No-ops when `active` is false (use for popovers that are not open).
 */
export function useOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
): void {
  useEffect(() => {
    if (!active) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (ref.current && target && !ref.current.contains(target)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, onClose, active])
}
