import { useCallback, useEffect, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

type ResizeEdge = 'left' | 'right'

interface ResizeOptions {
  key: string
  initial: number
  min: number
  edge: ResizeEdge
}

function readStoredWidth(key: string, fallback: number, min: number) {
  try {
    const raw = localStorage.getItem(key)
    const value = raw ? Number(raw) : fallback
    if (!Number.isFinite(value)) return fallback
    return Math.max(value, min)
  } catch {
    return fallback
  }
}

export function useResizableSidebar({
  key,
  initial,
  min,
  edge,
}: ResizeOptions) {
  const [width, setWidth] = useState(() => readStoredWidth(key, initial, min))

  useEffect(() => {
    try {
      localStorage.setItem(key, String(width))
    } catch {
      // ignore quota errors
    }
  }, [key, width])

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = width
      const cursor = document.body.style.cursor
      const userSelect = document.body.style.userSelect

      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      function handleMove(moveEvent: PointerEvent) {
        const delta =
          edge === 'right'
            ? moveEvent.clientX - startX
            : startX - moveEvent.clientX
        setWidth(Math.max(startWidth + delta, min))
      }

      function handleUp() {
        document.body.style.cursor = cursor
        document.body.style.userSelect = userSelect
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        window.removeEventListener('pointercancel', handleUp)
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
      window.addEventListener('pointercancel', handleUp)
    },
    [edge, min, width],
  )

  return { width, startResize }
}
