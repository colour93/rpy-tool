import { createContext, useCallback, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Toaster, toast as sonnerToast } from 'sonner'
import type { ExternalToast } from 'sonner'
import type { ToastMessage } from '@/types'

interface ToastContextValue {
  push: (toast: Omit<ToastMessage, 'id'>) => string
  success: (title: string, description?: string) => string
  error: (title: string, description?: string) => string
  warn: (title: string, description?: string) => string
  info: (title: string, description?: string) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const dismiss = useCallback((id: string) => {
    sonnerToast.dismiss(id)
  }, [])

  const push = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const options: ExternalToast = {
      id,
      description: toast.description,
      duration: toast.duration ?? 4200,
      action: toast.action
        ? {
            label: toast.action.label,
            onClick: toast.action.onTrigger,
          }
        : undefined,
    }

    if (toast.level === 'success') sonnerToast.success(toast.title, options)
    else if (toast.level === 'error') sonnerToast.error(toast.title, options)
    else if (toast.level === 'warning')
      sonnerToast.warning(toast.title, options)
    else sonnerToast.info(toast.title, options)

    return id
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
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
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster
        closeButton
        richColors
        expand={false}
        position="top-center"
        theme="system"
        visibleToasts={5}
        toastOptions={{
          classNames: {
            toast: 'border-border bg-card text-card-foreground',
            description: 'text-muted-foreground',
            actionButton: 'bg-primary text-primary-foreground',
          },
        }}
      />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) {
    throw new Error('useToast 必须在 ToastProvider 内部使用')
  }
  return value
}
