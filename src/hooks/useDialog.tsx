import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import type { ConfirmDialogOptions } from '@/types'

interface DialogContextValue {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>
}

interface PendingDialog extends ConfirmDialogOptions {
  resolve: (confirmed: boolean) => void
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingDialog | undefined>()

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve })
    })
  }, [])

  const handleClose = useCallback(
    (confirmed: boolean) => {
      if (pending) {
        pending.resolve(confirmed)
        setPending(undefined)
      }
    },
    [pending],
  )

  const value = useMemo<DialogContextValue>(() => ({ confirm }), [confirm])

  return (
    <DialogContext.Provider value={value}>
      {children}
      {pending && <ConfirmDialog dialog={pending} onClose={handleClose} />}
    </DialogContext.Provider>
  )
}

function ConfirmDialog({
  dialog,
  onClose,
}: {
  dialog: PendingDialog
  onClose: (confirmed: boolean) => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-5 backdrop-blur-sm animate-in fade-in"
      onClick={() => onClose(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className="w-[min(440px,100%)] rounded-2xl bg-card p-6 shadow-2xl animate-in zoom-in-95"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="dialog-title"
          className={cn(
            'm-0 mb-2 text-lg font-bold',
            dialog.tone === 'danger' && 'text-destructive',
          )}
        >
          {dialog.title}
        </h2>
        {dialog.description && (
          <p className="m-0 leading-relaxed text-muted-foreground">
            {dialog.description}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onClose(false)}
            autoFocus={dialog.tone !== 'danger'}
          >
            {dialog.cancelLabel ?? '取消'}
          </Button>
          <Button
            variant={dialog.tone === 'danger' ? 'destructive' : 'default'}
            onClick={() => onClose(true)}
            autoFocus={dialog.tone === 'danger'}
          >
            {dialog.confirmLabel ?? '确认'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function useDialog() {
  const value = useContext(DialogContext)
  if (!value) {
    throw new Error('useDialog 必须在 DialogProvider 内部使用')
  }
  return value
}
