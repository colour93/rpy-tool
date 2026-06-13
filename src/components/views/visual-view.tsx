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
  theme: 'light' | 'dark'
}) {
  const leftSidebar = useResizableSidebar({
    key: 'rpy-tool:sidebar:visual-left',
    initial: 260,
    min: 200,
    edge: 'right',
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

  return (
    <main
      className="grid h-[calc(100vh-var(--shell-chrome))] overflow-hidden"
      style={{
        gridTemplateColumns: `${leftSidebar.width}px 12px minmax(0,1fr)`,
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
      <section className="flex h-full flex-col overflow-hidden">
        <Toolbar
          title={selectedFile?.path ?? '未选择文件'}
          subtitle={
            selectedChapter
              ? `${selectedChapter.title} · ${selectedChapter.entryLabel}`
              : '等待脚本索引'
          }
        >
          <div className="flex items-center gap-1 rounded-md bg-secondary p-1">
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
              onClick={() => {
                if (fileMode !== 'source') onLoadSource()
                setFileMode('source')
              }}
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
              <KeyboardHint>Ctrl+S</KeyboardHint>
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
            />
          ) : (
            <MonacoSourceEditor
              value={sourceEditor.content}
              onChange={onChangeSource}
              filePath={sourceEditor.path ?? selectedFile?.path}
              theme={theme}
            />
          )}
        </div>
      </section>
      {/* VisualView 右侧立绘候选面板暂时停用，后续重新设计右侧工具栏时再恢复。 */}
    </main>
  )
}
