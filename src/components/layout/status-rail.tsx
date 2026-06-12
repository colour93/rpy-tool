import { Badge } from '@/components/ui/badge'
import type { CharacterState, RpyLine, WorkspaceSnapshot } from '@/types'

interface StatusRailProps {
  snapshot?: WorkspaceSnapshot
  status: string
  selectedLine?: RpyLine
  selectedState?: CharacterState
  draftCount: number
  diagnosticCount: number
}

export function StatusRail({
  snapshot,
  status,
  selectedLine,
  selectedState,
  draftCount,
  diagnosticCount,
}: StatusRailProps) {
  return (
    <div className="sticky top-[calc(3.5rem+2rem)] z-10 flex h-8 items-center gap-3 border-b border-border bg-secondary/60 px-4 font-mono text-xs text-muted-foreground backdrop-blur">
      <span className="flex-1 truncate" title={status}>
        {status}
      </span>
      <span title="文件数量">
        {snapshot ? `${snapshot.files.length} files` : 'no workspace'}
      </span>
      <span title="当前选中行">
        {selectedLine
          ? `${selectedLine.filePath}:${selectedLine.lineNumber}`
          : 'no line'}
      </span>
      <span title="当前选中立绘">
        {selectedState?.imageTag ?? 'no sprite'}
      </span>
      <Badge variant={draftCount > 0 ? 'warning' : 'success'}>
        {draftCount > 0 ? `${draftCount} 草稿` : '无草稿'}
      </Badge>
      <Badge variant={diagnosticCount > 0 ? 'warning' : 'success'}>
        {diagnosticCount > 0 ? `${diagnosticCount} 诊断` : '健康'}
      </Badge>
    </div>
  )
}
