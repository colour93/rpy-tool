import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import type { CharacterState, RpyLine, WorkspaceSnapshot } from '@/types'
import type { ReactNode } from 'react'

interface StatusRailProps {
  snapshot?: WorkspaceSnapshot
  status: string
  selectedLine?: RpyLine
  selectedState?: CharacterState
  draftCount: number
  diagnosticCount: number
  onOpenSelectedLine?: () => void
  onOpenSelectedSprite?: () => void
  onOpenDrafts?: () => void
  onOpenDiagnostics?: () => void
}

export function StatusRail({
  snapshot,
  status,
  selectedLine,
  selectedState,
  draftCount,
  diagnosticCount,
  onOpenSelectedLine,
  onOpenSelectedSprite,
  onOpenDrafts,
  onOpenDiagnostics,
}: StatusRailProps) {
  return (
    <div className="sticky top-[calc(3.5rem+2rem)] z-10 flex h-8 items-center gap-3 border-b border-border bg-secondary/60 px-4 font-mono text-xs text-muted-foreground backdrop-blur">
      <span className="flex-1 truncate" title={status}>
        {status}
      </span>
      <span title="文件数量">
        {snapshot ? `${snapshot.files.length} files` : 'no workspace'}
      </span>
      <RailButton
        title="在可视化编辑器中定位当前行"
        onClick={onOpenSelectedLine}
        disabled={!selectedLine}
      >
        {selectedLine
          ? `${selectedLine.filePath}:${selectedLine.lineNumber}`
          : 'no line'}
      </RailButton>
      <RailButton
        title="在立绘快插中查看当前立绘"
        onClick={onOpenSelectedSprite}
        disabled={!selectedState}
      >
        {selectedState?.imageTag ?? 'no sprite'}
      </RailButton>
      <button
        type="button"
        onClick={onOpenDrafts}
        disabled={draftCount === 0 || !onOpenDrafts}
        title="查看草稿队列"
        className="disabled:cursor-default"
      >
        <Badge variant={draftCount > 0 ? 'warning' : 'success'}>
          {draftCount > 0 ? `${draftCount} 草稿` : '无草稿'}
        </Badge>
      </button>
      <button
        type="button"
        onClick={onOpenDiagnostics}
        disabled={diagnosticCount === 0 || !onOpenDiagnostics}
        title="查看首页诊断"
        className="disabled:cursor-default"
      >
        <Badge variant={diagnosticCount > 0 ? 'warning' : 'success'}>
          {diagnosticCount > 0 ? `${diagnosticCount} 诊断` : '健康'}
        </Badge>
      </button>
    </div>
  )
}

function RailButton({
  children,
  title,
  onClick,
  disabled,
}: {
  children: ReactNode
  title: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled || !onClick}
      className={cn(
        'max-w-[28vw] truncate rounded px-1 py-0.5 text-left transition-colors',
        'hover:bg-card hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-muted-foreground',
      )}
    >
      {children}
    </button>
  )
}
