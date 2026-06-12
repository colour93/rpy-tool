import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { ToastMessage } from '@/types'

interface ToastContextValue {
  toasts: ToastMessage[]
  push: (toast: Omit<ToastMessage, 'id'>) => string
  success: (title: string, description?: string) => string
  error: (title: string, description?: string) => string
  warn: (title: string, description?: string) => string
  info: (title: string, description?: string) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const timers = useRef(new Map<string, number>())

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const next: ToastMessage = {
        duration: 4200,
        ...toast,
        id,
      }
      setToasts((current) => [...current, next].slice(-5))
      if (next.duration && next.duration > 0) {
        const handle = window.setTimeout(() => dismiss(id), next.duration)
        timers.current.set(id, handle)
      }
      return id
    },
    [dismiss],
  )

  useEffect(() => {
    const tracked = timers.current
    return () => {
      tracked.forEach((handle) => window.clearTimeout(handle))
      tracked.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title, description) =>
        push({ level: 'success', title, description }),
      error: (title, description) =>
        push({ level: 'error', title, description, duration: 6000 }),
      warn: (title, description) =>
        push({ level: 'warning', title, description, duration: 5200 }),
      info: (title, description) => push({ level: 'info', title, description }),
    }),
    [toasts, push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.level === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex items-stretch gap-3 rounded-lg border bg-card p-3 shadow-lg animate-in slide-in-from-bottom-2',
            toast.level === 'success' && 'border-success/40',
            toast.level === 'warning' && 'border-warning/40',
            toast.level === 'error' && 'border-destructive/40 bg-destructive/5',
            toast.level === 'info' && 'border-info/40',
          )}
        >
          <div className="min-w-0 flex-1">
            <strong className="block text-xs font-bold">{toast.title}</strong>
            {toast.description && (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {toast.description}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onTrigger()
                  onDismiss(toast.id)
                }}
                className="text-xs font-bold text-info hover:underline"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) {
    throw new Error('useToast 必须在 ToastProvider 内部使用')
  }
  return value
}
