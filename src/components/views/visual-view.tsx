import { useMemo } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MonacoSourceEditor } from '@/components/editor/monaco-editor'
import {
  FileSidebar,
  KeyboardHint,
  ScriptLineWorkbench,
  SidebarResizeHandle,
  Toolbar,
} from '@/components/shared'
import { useResizableSidebar } from '@/hooks/useResizableSidebar'
import { formatShortcut, SHORTCUTS } from '@/lib/shortcuts'
import { lineKey, lineMatchesQuery } from '@/appHelpers'
import { cn } from '@/lib/cn'
import type {
  ChapterRegistryItem,
  FileEntry,
  FileMode,
  RpyLine,
  SourceEditorState,
  WorkspaceSnapshot,
} from '@/types'

export function VisualView({
  snapshot,
  query,
  setQuery,
  files,
  selectedFile,
  onSelectFile,
  selectedLine,
  onSelectLine,
  selectedChapter,
  fileMode,
  setFileMode,
  sourceEditor,
  onLoadSource,
  onSaveSource,
  onChangeSource,
  onCopy,
  onSaveLine,
  onSaveAllDrafts,
  onInsertLine,
  onDeleteLine,
  draftSpeakerId,
  draftText,
  setDraftText,
  setDraftSpeaker,
  isBusy,
  dirty,
  canSaveLine,
  dirtyByFile,
  draftCountInSelectedFile,
  lineRowHeight,
  theme,
}: {
  snapshot?: WorkspaceSnapshot
  query: string
  setQuery: (query: string) => void
  files: FileEntry[]
  selectedFile?: FileEntry
  onSelectFile: (path: string, line?: RpyLine) => void
  selectedLine?: RpyLine
  onSelectLine: (line: RpyLine) => void
  selectedChapter?: ChapterRegistryItem
  fileMode: FileMode
  setFileMode: (mode: FileMode) => void
  sourceEditor: SourceEditorState
  onLoadSource: () => void
  onSaveSource: () => void
  onChangeSource: (content: string) => void
  onCopy: (value: string, label: string) => void
  onSaveLine: (line?: RpyLine) => void
  onSaveAllDrafts: () => void
  onInsertLine: (position: 'before' | 'after', line?: RpyLine) => void
  onDeleteLine: (line?: RpyLine) => void
  draftSpeakerId: string | null
  draftText: string
  setDraftText: (text: string) => void
  setDraftSpeaker: (speakerId: string | null) => void
  isBusy: boolean
  dirty: boolean
  canSaveLine: (line: RpyLine) => boolean
  dirtyByFile?: Set<string>
  draftCountInSelectedFile: number
  lineRowHeight: number
  theme: 'light' | 'dark'
}) {
  const leftSidebar = useResizableSidebar({
    key: 'rpy-tool:sidebar:visual-left',
    initial: 260,
    min: 200,
    edge: 'right',
  })
  const rightSidebar = useResizableSidebar({
    key: 'rpy-tool:sidebar:visual-context',
    initial: 340,
    min: 260,
    edge: 'left',
  })
  const visibleLines = useMemo(() => {
    const all = snapshot?.index.linesByFile[selectedFile?.path ?? ''] ?? []
    return all.filter((line) =>
      [
        'dialogue',
        'narration',
        'show',
        'scene',
        'label',
        'choice',
        'menu',
      ].includes(line.kind),
    )
  }, [selectedFile?.path, snapshot])
  const normalizedQuery = query.trim().toLowerCase()
  const characterById = useMemo(
    () =>
      new Map(
        (snapshot?.index.characters ?? []).map((character) => [
          character.id,
          character,
        ]),
      ),
    [snapshot?.index.characters],
  )
  const searchMatchLineKeys = useMemo(() => {
    if (!normalizedQuery) return undefined
    const keys = new Set<string>()
    for (const line of visibleLines) {
      const speakerName = line.characterId
        ? characterById.get(line.characterId)?.displayName
        : undefined
      if (lineMatchesQuery(line, normalizedQuery, speakerName)) {
        keys.add(lineKey(line))
      }
    }
    return keys
  }, [characterById, normalizedQuery, visibleLines])
  const contextLines = useMemo(() => {
    if (!snapshot || !selectedLine) return []
    const fileLines = snapshot.index.linesByFile[selectedLine.filePath] ?? []
    const index = fileLines.findIndex(
      (line) => lineKey(line) === lineKey(selectedLine),
    )
    if (index < 0) return []
    return fileLines.slice(Math.max(0, index - 4), index + 5)
  }, [selectedLine, snapshot])
  const sourceRevealLineNumber =
    selectedLine &&
    selectedLine.filePath === (sourceEditor.path ?? selectedFile?.path)
      ? selectedLine.lineNumber
      : undefined
  const openSourceMode = () => {
    if (fileMode !== 'source' || sourceEditor.path !== selectedFile?.path) {
      onLoadSource()
    }
    setFileMode('source')
  }

  return (
    <main
      className="grid h-[calc(100vh-var(--shell-chrome))] overflow-hidden"
      style={{
        gridTemplateColumns: `${leftSidebar.width}px 12px minmax(0,1fr) 12px ${rightSidebar.width}px`,
      }}
    >
      <FileSidebar
        query={query}
        setQuery={setQuery}
        files={files}
        selectedPath={selectedFile?.path}
        selectedLine={selectedLine}
        onSelectFile={onSelectFile}
        fileLines={snapshot?.index.linesByFile ?? {}}
        characters={snapshot?.index.characters ?? []}
        dirtyByFile={dirtyByFile}
      />
      <SidebarResizeHandle onPointerDown={leftSidebar.startResize} />

      {/* 中栏：编辑区 */}
      <section
        className="flex h-full flex-col overflow-hidden"
        data-tour="visual-workbench"
      >
        <Toolbar
          title={selectedFile?.path ?? '未选择文件'}
          subtitle={
            selectedChapter
              ? `${selectedChapter.title} · ${selectedChapter.entryLabel}`
              : '等待脚本索引'
          }
        >
          <div
            className="flex items-center gap-1 rounded-md bg-secondary p-1"
            data-tour="visual-mode-switch"
          >
            <button
              type="button"
              onClick={() => setFileMode('structured')}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-semibold transition-colors',
                fileMode === 'structured'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              结构化
            </button>
            <button
              type="button"
              onClick={openSourceMode}
              disabled={!selectedFile}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
                fileMode === 'source'
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              源文件 (Monaco)
            </button>
          </div>
          {fileMode === 'source' && (
            <Button
              variant="default"
              size="sm"
              onClick={onSaveSource}
              disabled={!sourceEditor.dirty || isBusy}
            >
              <Save className="h-3.5 w-3.5" />
              保存
              <KeyboardHint>{formatShortcut(SHORTCUTS.save)}</KeyboardHint>
            </Button>
          )}
        </Toolbar>

        <div className="min-h-0 flex-1">
          {fileMode === 'structured' ? (
            <ScriptLineWorkbench
              lines={visibleLines}
              selectedLine={selectedLine}
              onSelectLine={onSelectLine}
              characters={snapshot?.index.characters ?? []}
              files={snapshot?.files}
              draftText={draftText}
              draftSpeakerId={draftSpeakerId}
              dirty={dirty}
              isBusy={isBusy}
              onChangeText={setDraftText}
              onChangeSpeaker={setDraftSpeaker}
              onSaveLine={onSaveLine}
              onInsertLine={onInsertLine}
              onDeleteLine={onDeleteLine}
              onCopy={onCopy}
              canSaveLine={canSaveLine}
              searchMatchLineKeys={searchMatchLineKeys}
              emptyTitle="该文件没有可展示的剧情行"
              emptyDescription="请确认目录包含 .rpy 文件，或使用工具栏右上角重新扫描。"
              rowHeight={lineRowHeight}
            />
          ) : (
            <div className="flex h-full flex-col overflow-hidden">
              {draftCountInSelectedFile > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs">
                  <strong>{draftCountInSelectedFile} 行结构化草稿</strong>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    先处理同文件草稿，可以避免源文件保存后行号或内容语义错位。
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFileMode('structured')}
                  >
                    回到结构化
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={onSaveAllDrafts}
                    disabled={isBusy}
                  >
                    提交全部
                  </Button>
                </div>
              )}
              <div className="min-h-0 flex-1">
                <MonacoSourceEditor
                  value={sourceEditor.content}
                  onChange={onChangeSource}
                  filePath={sourceEditor.path ?? selectedFile?.path}
                  revealLineNumber={sourceRevealLineNumber}
                  theme={theme}
                />
              </div>
            </div>
          )}
        </div>
      </section>
      <SidebarResizeHandle onPointerDown={rightSidebar.startResize} />
      <VisualContextPanel
        line={selectedLine}
        chapter={selectedChapter}
        contextLines={contextLines}
        onOpenSource={openSourceMode}
        sourceActive={fileMode === 'source'}
      />
    </main>
  )
}

function VisualContextPanel({
  line,
  chapter,
  contextLines,
  onOpenSource,
  sourceActive,
}: {
  line?: RpyLine
  chapter?: ChapterRegistryItem
  contextLines: RpyLine[]
  onOpenSource: () => void
  sourceActive: boolean
}) {
  const activeKey = line ? lineKey(line) : undefined

  return (
    <aside className="flex h-full flex-col overflow-hidden border-l border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">上下文</h2>
            <p className="truncate text-xs text-muted-foreground">
              {line ? `${line.filePath}:${line.lineNumber}` : '等待选择行'}
            </p>
          </div>
          <Button
            variant={sourceActive ? 'default' : 'outline'}
            size="sm"
            onClick={onOpenSource}
            disabled={!line}
          >
            源文件
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin p-4">
        {!line || contextLines.length === 0 ? (
          <p className="rounded-md border border-border bg-secondary p-3 text-xs text-muted-foreground">
            从左侧列表选择一行后，这里会显示前后文。
          </p>
        ) : (
          <div className="space-y-4">
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold">附近代码</p>
                <span className="font-mono text-[10px] text-muted-foreground">
                  ±4 行
                </span>
              </div>
              <div className="overflow-hidden rounded-md border border-border bg-secondary/50">
                {contextLines.map((contextLine) => {
                  const active = lineKey(contextLine) === activeKey
                  return (
                    <div
                      key={lineKey(contextLine)}
                      className={cn(
                        'grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2 border-b border-border px-2 py-1.5 last:border-b-0',
                        active && 'bg-info/15 text-foreground',
                      )}
                    >
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {contextLine.lineNumber}
                      </span>
                      <code
                        className={cn(
                          'min-w-0 truncate whitespace-pre font-mono text-[11px]',
                          active ? 'text-foreground' : 'text-muted-foreground',
                        )}
                        title={contextLine.raw}
                      >
                        {contextLine.raw || ' '}
                      </code>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="space-y-2 border-t border-border pt-3 text-xs">
              <p className="font-bold">当前行</p>
              <div className="grid gap-1.5">
                <VisualDetail label="章节" value={chapter?.title ?? '-'} />
                <VisualDetail label="类型" value={line.kind} />
                <VisualDetail label="角色" value={line.characterId ?? '旁白'} />
                <VisualDetail
                  label="状态"
                  value={line.editable ? '可编辑' : '只读'}
                />
              </div>
            </section>
          </div>
        )}
      </div>
    </aside>
  )
}

function VisualDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-[11px]" title={value}>
        {value}
      </span>
    </div>
  )
}
