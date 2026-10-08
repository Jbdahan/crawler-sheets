import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const HOLD_MS = 320
const MOVE_CANCEL_PX = 8

interface Tracking {
  from: number
  label: string
  startX: number
  startY: number
  active: boolean
  timer: number
}

/**
 * Press-and-hold to drag between numbered slots (works with touch and mouse).
 * A quick tap still clicks; moving before the hold kicks in is treated as a scroll.
 */
export function useSlotDrag(onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<{ from: number; over: number | null; x: number; y: number; label: string } | null>(null)
  const track = useRef<Tracking | null>(null)
  const suppressClick = useRef(false)
  const onMoveRef = useRef(onMove)
  useLayoutEffect(() => {
    onMoveRef.current = onMove
  })

  useEffect(() => {
    const slotAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest('[data-slot]') as HTMLElement | null
      return el ? Number(el.dataset.slot) : null
    }
    const stop = () => {
      const t = track.current
      if (t) window.clearTimeout(t.timer)
      track.current = null
      setDrag(null)
      document.documentElement.classList.remove('slot-drag-active')
    }
    const onPointerMove = (e: PointerEvent) => {
      const t = track.current
      if (!t) return
      if (!t.active) {
        if (Math.hypot(e.clientX - t.startX, e.clientY - t.startY) > MOVE_CANCEL_PX) stop()
        return
      }
      setDrag({ from: t.from, over: slotAt(e.clientX, e.clientY), x: e.clientX, y: e.clientY, label: t.label })
    }
    const onPointerUp = (e: PointerEvent) => {
      const t = track.current
      if (!t) return
      if (t.active) {
        // swallow only the click that ends this drag, not the player's next tap
        suppressClick.current = true
        window.setTimeout(() => { suppressClick.current = false }, 80)
        const to = slotAt(e.clientX, e.clientY)
        if (to !== null && to !== t.from) onMoveRef.current(t.from, to)
      }
      stop()
    }
    // once a drag is live, stop the page from scrolling under the finger
    const onTouchMove = (e: TouchEvent) => {
      if (track.current?.active) e.preventDefault()
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('touchmove', onTouchMove)
      stop()
    }
  }, [])

  /** Spread onto each slot. Pass a label for slots that can be picked up (empty slots: null). */
  const slotProps = (index: number, label: string | null) => ({
    'data-slot': index,
    className: drag ? (drag.from === index ? ' slot-dragging' : drag.over === index ? ' slot-over' : '') : '',
    onPointerDown: (e: React.PointerEvent) => {
      if (!label || (e.pointerType === 'mouse' && e.button !== 0)) return
      const t: Tracking = {
        from: index, label, startX: e.clientX, startY: e.clientY, active: false,
        timer: window.setTimeout(() => {
          if (track.current !== t) return
          t.active = true
          document.documentElement.classList.add('slot-drag-active')
          navigator.vibrate?.(10)
          setDrag({ from: index, over: index, x: t.startX, y: t.startY, label })
        }, HOLD_MS),
      }
      track.current = t
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (suppressClick.current) {
        suppressClick.current = false
        e.preventDefault()
        e.stopPropagation()
      }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  })

  const ghost: ReactNode = drag ? (
    <div className="slot-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">{drag.label}</div>
  ) : null

  return { slotProps, ghost, dragging: !!drag }
}

/** Move one item of a list to another position, shifting the rest (for reordering lists). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [it] = next.splice(from, 1)
  next.splice(to, 0, it)
  return next
}

/** Swap two Hotlist slots (either may be empty). */
export function swapSlots<T>(list: T[], a: number, b: number): T[] {
  const next = [...list]
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}
