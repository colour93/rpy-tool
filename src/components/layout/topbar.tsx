import {
  Folder,
  FolderOpen,
  Moon,
  RefreshCw,
  Search,
  Sun,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { KeyboardHint } from '@/components/shared'
import { navigation } from '@/appHelpers'
import type { ThemeMode, ViewKey, WorkspaceSnapshot } from '@/types'
import { cn } from '@/lib/cn'

interface TopbarProps {
  view: ViewKey
  setView: (view: ViewKey) => void
  snapshot?: WorkspaceSnapshot
  selectedPath?: string
  isBusy: boolean
  onOpen: () => void
  onRescan: () => void
  onForget: () => void
  onOpenCommandPalette: () => void
  hasUnsaved: boolean
  theme: ThemeMode
  onToggleTheme: () => void
}

export function Topbar({
  view,
  setView,
  snapshot,
  selectedPath,
  isBusy,
  onOpen,
  onRescan,
  onForget,
  onOpenCommandPalette,
  hasUnsaved,
  theme,
  onToggleTheme,
}: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card">
      <div className="flex h-14 items-center gap-3 px-4">
        <button
          type="button"
          onClick={() => setView('home')}
          className="flex items-center gap-2 font-bold transition-opacity hover:opacity-80"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary font-mono text-sm text-primary-foreground">
            R
          </span>
          <span className="text-sm">Rpy Tool</span>
        </button>

        <div className="h-6 w-px bg-border" />

        <nav className="flex items-center gap-1 rounded-lg bg-secondary p-1">
          {navigation.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.key)}
              title={item.hint}
              className={cn(
                'rounded px-3 py-1.5 text-xs font-semibold transition-colors',
                item.key === view
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenCommandPalette}
            title="命令面板 (Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5" />
            <KeyboardHint>Ctrl+K</KeyboardHint>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleTheme}
            title={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
          >
            {theme === 'dark' ? (
              <Sun className="h-3.5 w-3.5" />
            ) : (
              <Moon className="h-3.5 w-3.5" />
            )}
          </Button>
          {snapshot ? (
            <>
              <Badge variant={hasUnsaved ? 'warning' : 'muted'}>
                {snapshot.name}
                {hasUnsaved ? ' · 未保存' : ''}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={onRescan}
                disabled={isBusy}
                title="重新扫描 (F5)"
              >
                <RefreshCw
                  className={cn('h-3.5 w-3.5', isBusy && 'animate-spin')}
                />
                重扫
                <KeyboardHint>F5</KeyboardHint>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onForget}
                disabled={isBusy}
              >
                <X className="h-3.5 w-3.5" />
                关闭
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={onOpen}
                disabled={isBusy}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                换一个
              </Button>
            </>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={onOpen}
              disabled={isBusy}
            >
              <Folder className="h-3.5 w-3.5" />
              打开工作区
            </Button>
          )}
        </div>
      </div>

      {/* Path bar */}
      <div className="flex h-8 items-center gap-2 border-t border-border bg-secondary/40 px-4 font-mono text-xs">
        <span className="text-muted-foreground">路径</span>
        <span className="text-muted-foreground">›</span>
        {snapshot ? (
          <span className="text-muted-foreground">{snapshot.name}</span>
        ) : (
          <span className="text-muted-foreground italic">未打开工作区</span>
        )}
        {selectedPath ? (
          <>
            <span className="text-muted-foreground">›</span>
            <span className="truncate text-foreground" title={selectedPath}>
              {selectedPath}
            </span>
          </>
        ) : null}
      </div>
    </header>
  )
}
