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
import { cn } from '@/lib/cn'
import type { CommandDefinition } from '@/types'

interface CommandPaletteContextValue {
  commands: CommandDefinition[]
  registerCommands: (commands: CommandDefinition[]) => () => void
  open: () => void
  close: () => void
  isOpen: boolean
}

const CommandPaletteContext = createContext<
  CommandPaletteContextValue | undefined
>(undefined)

export function CommandPaletteProvider({
  children,
  workspaceReady,
}: {
  children: ReactNode
  workspaceReady: boolean
}) {
  const [registry, setRegistry] = useState<Record<string, CommandDefinition>>({})
  const [isOpen, setIsOpen] = useState(false)
  const idCounter = useRef(0)

  const registerCommands = useCallback((commands: CommandDefinition[]) => {
    const ids = commands.map((command) => {
      const id = command.id ?? `cmd-${++idCounter.current}`
      return { ...command, id }
    })
    setRegistry((current) => {
      const next = { ...current }
      for (const command of ids) next[command.id] = command
      return next
    })
    return () => {
      setRegistry((current) => {
        const next = { ...current }
        for (const command of ids) delete next[command.id]
        return next
      })
    }
  }, [])

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const ctrl = isMac ? event.metaKey : event.ctrlKey
      if (ctrl && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault()
        setIsOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const commands = useMemo(() => Object.values(registry), [registry])

  const value = useMemo<CommandPaletteContextValue>(
    () => ({
      commands,
      registerCommands,
      open,
      close,
      isOpen,
    }),
    [commands, registerCommands, open, close, isOpen],
  )

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {isOpen && (
        <CommandPalette
          commands={commands}
          workspaceReady={workspaceReady}
          onClose={close}
        />
      )}
    </CommandPaletteContext.Provider>
  )
}

function CommandPalette({
  commands,
  workspaceReady,
  onClose,
}: {
  commands: CommandDefinition[]
  workspaceReady: boolean
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const items = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return commands
      .filter((command) => !command.requiresWorkspace || workspaceReady)
      .filter((command) => {
        if (!normalized) return true
        const haystack = `${command.title} ${command.hint ?? ''} ${command.group ?? ''}`.toLowerCase()
        return haystack.includes(normalized)
      })
  }, [commands, query, workspaceReady])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, items.length])

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, items.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const command = items[activeIndex]
      if (command) {
        command.run()
        onClose()
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-foreground/30 px-5 pt-20 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="命令面板"
        className="w-[min(640px,100%)] overflow-hidden rounded-xl bg-card shadow-2xl animate-in zoom-in-95"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="搜索命令…  (Esc 关闭)"
          className="h-12 w-full border-0 border-b border-border bg-card px-4 text-base outline-none"
        />
        <div className="max-h-[420px] overflow-auto scrollbar-thin p-1.5">
          {items.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              没有匹配的命令
            </p>
          ) : (
            items.map((command, index) => (
              <button
                key={command.id}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  command.run()
                  onClose()
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition-colors',
                  index === activeIndex && 'bg-accent',
                )}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  {command.group && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-info">
                      {command.group}
                    </span>
                  )}
                  <strong className="text-sm">{command.title}</strong>
                  {command.hint && (
                    <span className="truncate text-xs text-muted-foreground">
                      {command.hint}
                    </span>
                  )}
                </div>
                {command.shortcut && (
                  <kbd className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px]">
                    {command.shortcut}
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>
        <p className="m-0 border-t border-border bg-secondary px-3 py-2 text-[11px] text-muted-foreground">
          <kbd className="mx-0.5 rounded border border-border bg-card px-1 font-mono">↑</kbd>
          <kbd className="mx-0.5 rounded border border-border bg-card px-1 font-mono">↓</kbd>
          {' '}选择 ·{' '}
          <kbd className="mx-0.5 rounded border border-border bg-card px-1 font-mono">Enter</kbd>
          {' '}执行 ·{' '}
          <kbd className="mx-0.5 rounded border border-border bg-card px-1 font-mono">Esc</kbd>
          {' '}关闭
        </p>
      </div>
    </div>
  )
}

export function useCommandPalette() {
  const value = useContext(CommandPaletteContext)
  if (!value) {
    throw new Error('useCommandPalette 必须在 CommandPaletteProvider 内部使用')
  }
  return value
}

export function useRegisterCommands(
  commands: CommandDefinition[],
  deps: React.DependencyList,
) {
  const { registerCommands } = useCommandPalette()
  useEffect(() => {
    return registerCommands(commands)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
