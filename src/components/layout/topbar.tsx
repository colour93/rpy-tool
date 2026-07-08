import { useState } from 'react'
import {
  Clock3,
  Folder,
  FolderOpen,
  HelpCircle,
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
import type { WorkspaceHistoryEntry } from '@/services/workspace'
import { cn } from '@/lib/cn'
import { formatShortcut, SHORTCUTS } from '@/lib/shortcuts'
import { APP_VERSION } from '@/services/app-version'

interface TopbarProps {
  view: ViewKey
  setView: (view: ViewKey) => void
  snapshot?: WorkspaceSnapshot
  selectedPath?: string
  isBusy: boolean
  onOpen: () => void
  onOpenRecent: (entry: WorkspaceHistoryEntry) => void
  onForgetRecent: (entry: WorkspaceHistoryEntry) => void
  onRescan: () => void
  onForget: () => void
  onOpenCommandPalette: () => void
  hasUnsaved: boolean
  theme: ThemeMode
  onToggleTheme: () => void
  onOpenTourGuide: () => void
  workspaceHistory: WorkspaceHistoryEntry[]
}

export function Topbar({
  view,
  setView,
  snapshot,
  selectedPath,
  isBusy,
  onOpen,
  onOpenRecent,
  onForgetRecent,
  onRescan,
  onForget,
  onOpenCommandPalette,
  hasUnsaved,
  theme,
  onToggleTheme,
  onOpenTourGuide,
  workspaceHistory,
}: TopbarProps) {
  const [historyOpen, setHistoryOpen] = useState(false)
  const hasHistory = workspaceHistory.length > 0

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card">
      <div className="flex h-14 items-center gap-3 px-4">
        <button
          type="button"
          data-tour="app-brand"
          onClick={() => setView('home')}
          className="flex items-center gap-2 font-bold transition-opacity hover:opacity-80"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary font-mono text-sm text-primary-foreground">
            R
          </span>
          <span className="text-sm">Rpy Tool</span>
          <span className="rounded border border-border bg-secondary/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-muted-foreground">
            v{APP_VERSION}
          </span>
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
            data-tour="command-settings"
            variant="outline"
            size="sm"
            onClick={onOpenCommandPalette}
            title={`命令面板 (${formatShortcut(SHORTCUTS.commandPalette)})`}
          >
            <Search className="h-3.5 w-3.5" />
            <KeyboardHint>
              {formatShortcut(SHORTCUTS.commandPalette)}
            </KeyboardHint>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenTourGuide}
            title="用户旅程引导"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            引导
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
                title={`重新扫描 (${formatShortcut(SHORTCUTS.rescan)})`}
              >
                <RefreshCw
                  className={cn('h-3.5 w-3.5', isBusy && 'animate-spin')}
                />
                重扫
                <KeyboardHint>{formatShortcut(SHORTCUTS.rescan)}</KeyboardHint>
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
                data-tour="workspace-action"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                换一个
              </Button>
              {hasHistory && (
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setHistoryOpen((open) => !open)}
                    disabled={isBusy}
                    title="最近工作区"
                  >
                    <Clock3 className="h-3.5 w-3.5" />
                    最近
                  </Button>
                  {historyOpen && (
                    <WorkspaceHistoryMenu
                      history={workspaceHistory}
                      onOpen={(entry) => {
                        setHistoryOpen(false)
                        onOpenRecent(entry)
                      }}
                      onForget={onForgetRecent}
                    />
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {hasHistory && (
                <div className="relative" data-tour="workspace-action">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setHistoryOpen((open) => !open)}
                    disabled={isBusy}
                  >
                    <Clock3 className="h-3.5 w-3.5" />
                    最近工作区
                  </Button>
                  {historyOpen && (
                    <WorkspaceHistoryMenu
                      history={workspaceHistory}
                      onOpen={(entry) => {
                        setHistoryOpen(false)
                        onOpenRecent(entry)
                      }}
                      onForget={onForgetRecent}
                    />
                  )}
                </div>
              )}
              <Button
                variant={hasHistory ? 'outline' : 'default'}
                size="sm"
                onClick={onOpen}
                disabled={isBusy}
                data-tour={hasHistory ? undefined : 'workspace-action'}
              >
                <Folder className="h-3.5 w-3.5" />
                打开工作区
              </Button>
            </>
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

function WorkspaceHistoryMenu({
  history,
  onOpen,
  onForget,
}: {
  history: WorkspaceHistoryEntry[]
  onOpen: (entry: WorkspaceHistoryEntry) => void
  onForget: (entry: WorkspaceHistoryEntry) => void
}) {
  return (
    <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 overflow-hidden rounded-lg border border-border bg-popover p-1 shadow-xl">
      <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">
        最近工作区
      </div>
      {history.map((entry) => (
        <div
          key={entry.id}
          className="group flex items-center gap-1 rounded-md hover:bg-secondary"
        >
          <button
            type="button"
            className="min-w-0 flex-1 px-2 py-2 text-left"
            onClick={() => onOpen(entry)}
            title={entry.name}
          >
            <div className="truncate text-xs font-semibold">{entry.name}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {entry.openedAt
                ? new Date(entry.openedAt).toLocaleString()
                : '已关联'}
            </div>
          </button>
          <button
            type="button"
            className="mr-1 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-background hover:text-foreground group-hover:opacity-100"
            onClick={() => onForget(entry)}
            title="从最近工作区移除"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
