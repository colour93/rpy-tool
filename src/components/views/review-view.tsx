import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Download,
  EyeOff,
  MessageSquareWarning,
  PanelBottomClose,
  PanelBottomOpen,
  PencilLine,
  SquareCheckBig,
  Upload,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import {
  DetailRow,
  KeyboardHint,
  LineJumpButton,
  ScriptLineWorkbench,
  SidebarResizeHandle,
  Toolbar,
} from '@/components/shared'
import { useHotkeys } from '@/hooks/useHotkeys'
import { useResizableSidebar } from '@/hooks/useResizableSidebar'
import {
  chapterForLine,
  lineKey,
  lineMatchesQuery,
  uniqueValues,
} from '@/appHelpers'
import { cn } from '@/lib/cn'
import type {
  ChapterRegistryItem,
  Diagnostic,
  DraftEntry,
  ReviewMark,
  ReviewStatus,
  RpyLine,
  WorkspaceSnapshot,
} from '@/types'

type ReviewScope =
  | 'all'
  | 'chapter'
  | 'dirty'
  | 'diagnostic'
  | 'noted'
  | ReviewStatus

const statusLabels: Record<ReviewStatus, string> = {
  unreviewed: '未校对',
  approved: '已通过',
  'needs-change': '需修改',
  ignored: '忽略',
}

const statusVariants: Record<
  ReviewStatus,
  'muted' | 'success' | 'warning' | 'default'
> = {
  unreviewed: 'muted',
  approved: 'success',
  'needs-change': 'warning',
  ignored: 'default',
}

const emptyChapters: ChapterRegistryItem[] = []
const emptyDiagnostics: Diagnostic[] = []

export function ReviewView({
  snapshot,
  selectedLine,
  onSelectLine,
  draftText,
  setDraftText,
  setDraftSpeaker,
  onSaveLine,
  onInsertLine,
  onDeleteLine,
  draftSpeakerId,
  onSaveAllDrafts,
  isBusy,
  dirty,
  canSaveLine,
  onCopy,
  drafts,
  reviewMarks,
  onMarkReview,
  onClearReviewMark,
  onUpdateReviewNote,
  onExportReviewMarks,
  onImportReviewMarks,
  onJumpToLine,
  showLineOperationPanel,
  onToggleLineOperationPanel,
}: {
  snapshot?: WorkspaceSnapshot
  selectedLine?: RpyLine
  onSelectLine: (line: RpyLine) => void
  draftText: string
  setDraftText: (value: string) => void
  setDraftSpeaker: (speakerId: string | null) => void
  onSaveLine: (line?: RpyLine) => void
  onInsertLine: (position: 'before' | 'after', line?: RpyLine) => void
  onDeleteLine: (line?: RpyLine) => void
  draftSpeakerId: string | null
  onSaveAllDrafts: () => void
  isBusy: boolean
  dirty: boolean
  canSaveLine: (line: RpyLine) => boolean
  onCopy: (value: string, label: string) => void
  drafts: Record<string, DraftEntry>
  reviewMarks: Record<string, ReviewMark>
  onMarkReview: (
    line: RpyLine,
    status: Exclude<ReviewStatus, 'unreviewed'>,
  ) => void
  onClearReviewMark: (line: RpyLine) => void
  onUpdateReviewNote: (line: RpyLine, note: string) => void
  onExportReviewMarks: () => void
  onImportReviewMarks: (file: File) => void
  onJumpToLine: (filePath: string, lineNumber: number) => void
  showLineOperationPanel: boolean
  onToggleLineOperationPanel: () => void
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const leftSidebar = useResizableSidebar({
    key: 'rpy-tool:sidebar:review-left',
    initial: 280,
    min: 220,
    edge: 'right',
  })
  const rightSidebar = useResizableSidebar({
    key: 'rpy-tool:sidebar:review-right',
    initial: 360,
    min: 280,
    edge: 'left',
  })
  const [scope, setScope] = useState<ReviewScope>('all')
  const [speakerFilter, setSpeakerFilter] = useState('all')
  const [chapterId, setChapterId] = useState('all')
  const [query, setQuery] = useState('')
  const [selectedLineKeys, setSelectedLineKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const [selectionAnchorKey, setSelectionAnchorKey] = useState<
    string | undefined
  >()

  const chapters = snapshot?.index.chapters ?? emptyChapters
  const diagnostics = snapshot?.index.diagnostics ?? emptyDiagnostics
  const diagnosticKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const diagnostic of diagnostics) {
      if (diagnostic.filePath && diagnostic.lineNumber) {
        keys.add(`${diagnostic.filePath}:${diagnostic.lineNumber}`)
      }
    }
    return keys
  }, [diagnostics])
  const reviewableLines = useMemo(
    () =>
      (snapshot?.index.lines ?? []).filter(
        (line) =>
          line.editable &&
          (line.kind === 'dialogue' ||
            line.kind === 'narration' ||
            line.kind === 'choice'),
      ),
    [snapshot],
  )
  const selectedChapter =
    selectedLine && snapshot
      ? chapterForLine(snapshot.index.chapters, selectedLine)
      : chapters[0]
  const selectedLineStatus = selectedLine
    ? (reviewMarks[lineKey(selectedLine)]?.status ?? 'unreviewed')
    : 'unreviewed'

  const speakers = useMemo(
    () =>
      uniqueValues(reviewableLines.map((line) => line.characterId ?? '旁白')),
    [reviewableLines],
  )
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
  const filteredLines = useMemo(
    () =>
      reviewableLines
        .filter((line) => {
          const key = lineKey(line)
          const status = reviewMarks[key]?.status ?? 'unreviewed'
          if (scope === 'chapter') {
            const chapter = chapterForLine(chapters, line)
            return chapter?.id === selectedChapter?.id
          }
          if (scope === 'dirty') return key in drafts
          if (scope === 'diagnostic') return diagnosticKeys.has(key)
          if (scope === 'noted') return Boolean(reviewMarks[key]?.note?.trim())
          if (scope !== 'all') return status === scope
          return true
        })
        .filter((line) => {
          if (chapterId === 'all') return true
          return chapterForLine(chapters, line)?.id === chapterId
        })
        .filter((line) =>
          speakerFilter === 'all'
            ? true
            : (line.characterId ?? '旁白') === speakerFilter,
        ),
    [
      chapterId,
      chapters,
      diagnosticKeys,
      drafts,
      reviewMarks,
      reviewableLines,
      scope,
      selectedChapter?.id,
      speakerFilter,
    ],
  )
  const currentIndex = selectedLine
    ? filteredLines.findIndex((line) => lineKey(line) === lineKey(selectedLine))
    : -1
  const activeLineKey = selectedLine ? lineKey(selectedLine) : undefined
  const searchMatches = useMemo(() => {
    if (!normalizedQuery) return []
    return filteredLines.filter((line) => {
      const speakerName = line.characterId
        ? characterById.get(line.characterId)?.displayName
        : undefined
      return lineMatchesQuery(line, normalizedQuery, speakerName)
    })
  }, [characterById, filteredLines, normalizedQuery])
  const searchMatchLineKeys = useMemo(
    () => new Set(searchMatches.map((line) => lineKey(line))),
    [searchMatches],
  )
  const searchMatchPosition = activeLineKey
    ? searchMatches.findIndex((line) => lineKey(line) === activeLineKey) + 1
    : 0
  const filteredLineKeys = useMemo(
    () => new Set(filteredLines.map((line) => lineKey(line))),
    [filteredLines],
  )
  const visibleSelectedLineKeys = useMemo(() => {
    const next = new Set<string>()
    for (const key of selectedLineKeys) {
      if (filteredLineKeys.has(key)) next.add(key)
    }
    return next
  }, [filteredLineKeys, selectedLineKeys])
  const selectedReviewLines = useMemo(
    () =>
      filteredLines.filter((line) =>
        visibleSelectedLineKeys.has(lineKey(line)),
      ),
    [filteredLines, visibleSelectedLineKeys],
  )
  const isAllFilteredSelected =
    filteredLines.length > 0 &&
    visibleSelectedLineKeys.size === filteredLines.length
  const operationLines = useMemo(() => {
    if (selectedReviewLines.length > 0) return selectedReviewLines
    if (selectedLine && activeLineKey && filteredLineKeys.has(activeLineKey)) {
      return [selectedLine]
    }
    return []
  }, [activeLineKey, filteredLineKeys, selectedLine, selectedReviewLines])
  const totalDrafts = Object.keys(drafts).length
  const reviewableLineKeys = useMemo(
    () => new Set(reviewableLines.map((line) => lineKey(line))),
    [reviewableLines],
  )
  const activeReviewMarks = useMemo(
    () =>
      Object.values(reviewMarks).filter((mark) =>
        reviewableLineKeys.has(mark.lineKey),
      ),
    [reviewMarks, reviewableLineKeys],
  )
  const approvedCount = activeReviewMarks.filter(
    (mark) => mark.status === 'approved',
  ).length
  const needsChangeCount = activeReviewMarks.filter(
    (mark) => mark.status === 'needs-change',
  ).length
  const ignoredCount = activeReviewMarks.filter(
    (mark) => mark.status === 'ignored',
  ).length
  const unreviewedCount = Math.max(
    0,
    reviewableLines.length - approvedCount - needsChangeCount - ignoredCount,
  )
  const noteCount = activeReviewMarks.filter((mark) => mark.note?.trim()).length
  const OperationPanelIcon = showLineOperationPanel
    ? PanelBottomClose
    : PanelBottomOpen

  const selectSingleLine = useCallback(
    (line: RpyLine) => {
      const key = lineKey(line)
      onSelectLine(line)
      setSelectedLineKeys(new Set([key]))
      setSelectionAnchorKey(key)
    },
    [onSelectLine],
  )

  useEffect(() => {
    if (
      filteredLines.length > 0 &&
      (!activeLineKey || !filteredLineKeys.has(activeLineKey))
    ) {
      selectSingleLine(filteredLines[0])
      return
    }

    setSelectedLineKeys((current) => {
      const next = new Set<string>()
      for (const key of current) {
        if (filteredLineKeys.has(key)) next.add(key)
      }
      if (
        next.size === 0 &&
        activeLineKey &&
        filteredLineKeys.has(activeLineKey)
      ) {
        next.add(activeLineKey)
      }
      return setsEqual(current, next) ? current : next
    })
    setSelectionAnchorKey((current) => {
      if (current && filteredLineKeys.has(current)) return current
      return activeLineKey && filteredLineKeys.has(activeLineKey)
        ? activeLineKey
        : undefined
    })
  }, [activeLineKey, filteredLineKeys, filteredLines, selectSingleLine])

  function handlePrev() {
    if (currentIndex > 0) selectSingleLine(filteredLines[currentIndex - 1])
  }

  function handleNext() {
    if (currentIndex >= 0 && currentIndex < filteredLines.length - 1) {
      selectSingleLine(filteredLines[currentIndex + 1])
    }
  }

  function handleNavigateSearch(delta: 1 | -1) {
    if (searchMatches.length === 0) return
    const activeSearchIndex = activeLineKey
      ? searchMatches.findIndex((line) => lineKey(line) === activeLineKey)
      : -1
    if (activeSearchIndex >= 0) {
      const nextIndex =
        (activeSearchIndex + delta + searchMatches.length) %
        searchMatches.length
      selectSingleLine(searchMatches[nextIndex])
      return
    }
    if (currentIndex < 0) {
      selectSingleLine(
        delta > 0 ? searchMatches[0] : searchMatches[searchMatches.length - 1],
      )
      return
    }
    const indexedMatches = searchMatches.map((line) => ({
      line,
      index: filteredLines.findIndex((item) => lineKey(item) === lineKey(line)),
    }))
    const previousMatch = [...indexedMatches]
      .reverse()
      .find((match) => match.index >= 0 && match.index < currentIndex)
    const nextMatch =
      delta > 0
        ? (indexedMatches.find((match) => match.index > currentIndex) ??
          indexedMatches[0])
        : (previousMatch ?? indexedMatches[indexedMatches.length - 1])
    selectSingleLine(nextMatch.line)
  }

  function handleSelectAllFilteredLines() {
    if (filteredLines.length === 0) return
    setSelectedLineKeys(new Set(filteredLines.map((line) => lineKey(line))))
    if (selectedLine && activeLineKey && filteredLineKeys.has(activeLineKey)) {
      setSelectionAnchorKey(activeLineKey)
      return
    }
    selectSingleLine(filteredLines[0])
    setSelectedLineKeys(new Set(filteredLines.map((line) => lineKey(line))))
  }

  function handleCollapseSelection() {
    if (selectedLine && activeLineKey && filteredLineKeys.has(activeLineKey)) {
      setSelectedLineKeys(new Set([activeLineKey]))
      setSelectionAnchorKey(activeLineKey)
      return
    }
    if (filteredLines[0]) selectSingleLine(filteredLines[0])
  }

  function advanceAfterLines(targets: RpyLine[]) {
    if (filteredLines.length === 0) return
    const targetIndexes = targets
      .map((line) =>
        filteredLines.findIndex((item) => lineKey(item) === lineKey(line)),
      )
      .filter((index) => index >= 0)
    if (targetIndexes.length === 0) {
      selectSingleLine(filteredLines[0])
      return
    }
    const lastIndex = Math.max(...targetIndexes)
    const firstIndex = Math.min(...targetIndexes)
    const nextLine =
      filteredLines[lastIndex + 1] ?? filteredLines[firstIndex - 1]
    if (nextLine) selectSingleLine(nextLine)
  }

  function handleSelectReviewLine(
    line: RpyLine,
    event?: ReactMouseEvent<HTMLButtonElement>,
  ) {
    const key = lineKey(line)
    onSelectLine(line)

    if (event?.shiftKey) {
      const anchorIndex = selectionAnchorKey
        ? filteredLines.findIndex(
            (item) => lineKey(item) === selectionAnchorKey,
          )
        : -1
      const targetIndex = filteredLines.findIndex(
        (item) => lineKey(item) === key,
      )
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex)
        const end = Math.max(anchorIndex, targetIndex)
        const next =
          event.ctrlKey || event.metaKey
            ? new Set(selectedLineKeys)
            : new Set<string>()
        for (let index = start; index <= end; index += 1) {
          next.add(lineKey(filteredLines[index]))
        }
        setSelectedLineKeys(next)
        return
      }
    }

    if (event?.ctrlKey || event?.metaKey) {
      const next = new Set(selectedLineKeys)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      setSelectedLineKeys(next)
      setSelectionAnchorKey(key)
      return
    }

    setSelectedLineKeys(new Set([key]))
    setSelectionAnchorKey(key)
  }

  function handleMarkAndAdvance(status: Exclude<ReviewStatus, 'unreviewed'>) {
    if (operationLines.length === 0) return
    operationLines.forEach((line) => onMarkReview(line, status))
    advanceAfterLines(operationLines)
  }

  function handleClearAndAdvance() {
    if (operationLines.length === 0) return
    operationLines.forEach(onClearReviewMark)
    advanceAfterLines(operationLines)
  }

  function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) onImportReviewMarks(file)
    event.target.value = ''
  }

  useHotkeys(
    [
      { combo: 'j', handler: handleNext, disabled: filteredLines.length === 0 },
      { combo: 'k', handler: handlePrev, disabled: filteredLines.length === 0 },
      {
        combo: '1',
        handler: () => handleMarkAndAdvance('approved'),
        disabled: operationLines.length === 0,
      },
      {
        combo: '2',
        handler: () => handleMarkAndAdvance('needs-change'),
        disabled: operationLines.length === 0,
      },
      {
        combo: '3',
        handler: () => handleMarkAndAdvance('ignored'),
        disabled: operationLines.length === 0,
      },
      {
        combo: '0',
        handler: handleClearAndAdvance,
        disabled: operationLines.length === 0,
      },
      { combo: 'mod+a', handler: handleSelectAllFilteredLines },
      {
        combo: 'Escape',
        handler: handleCollapseSelection,
        disabled: visibleSelectedLineKeys.size <= 1 && Boolean(activeLineKey),
      },
    ],
    [
      activeLineKey,
      currentIndex,
      filteredLineKeys,
      filteredLines,
      operationLines,
      selectedLine,
      visibleSelectedLineKeys,
    ],
  )

  return (
    <main
      className="grid h-[calc(100vh-var(--shell-chrome))] overflow-hidden"
      style={{
        gridTemplateColumns: `${leftSidebar.width}px 12px minmax(0,1fr) 12px ${rightSidebar.width}px`,
      }}
    >
      <ReviewQueueSidebar
        scope={scope}
        setScope={setScope}
        query={query}
        setQuery={setQuery}
        speakerFilter={speakerFilter}
        setSpeakerFilter={setSpeakerFilter}
        chapterId={chapterId}
        setChapterId={setChapterId}
        speakers={speakers}
        chapters={chapters}
        totalLines={reviewableLines.length}
        filteredLines={filteredLines.length}
        totalDrafts={totalDrafts}
        diagnosticCount={diagnosticKeys.size}
        unreviewedCount={unreviewedCount}
        approvedCount={approvedCount}
        needsChangeCount={needsChangeCount}
        ignoredCount={ignoredCount}
        noteCount={noteCount}
        searchMatchCount={searchMatches.length}
        searchMatchPosition={searchMatchPosition}
        onNavigateSearch={handleNavigateSearch}
      />
      <SidebarResizeHandle onPointerDown={leftSidebar.startResize} />

      <section className="flex h-full flex-col overflow-hidden">
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportFile}
        />
        <Toolbar
          title="文本校对"
          subtitle={`${filteredLines.length}/${reviewableLines.length} 行 · ${scopeLabel(scope)} · ${
            speakerFilter === 'all' ? '全部角色' : speakerFilter
          }${operationLines.length > 1 ? ` · 已选 ${operationLines.length} 行` : ''}`}
        >
          <Button
            variant={isAllFilteredSelected ? 'default' : 'outline'}
            size="sm"
            onClick={handleSelectAllFilteredLines}
            disabled={filteredLines.length === 0}
            title="全选当前筛选结果 (Ctrl+A)"
          >
            <SquareCheckBig className="h-3.5 w-3.5" />
            全选
            <KeyboardHint>Ctrl+A</KeyboardHint>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCollapseSelection}
            disabled={visibleSelectedLineKeys.size <= 1}
            title="取消多选 (Esc)"
          >
            <X className="h-3.5 w-3.5" />
            取消选择
            <KeyboardHint>Esc</KeyboardHint>
          </Button>
          <Button
            variant={showLineOperationPanel ? 'default' : 'outline'}
            size="sm"
            onClick={onToggleLineOperationPanel}
            aria-pressed={showLineOperationPanel}
            title={showLineOperationPanel ? '隐藏底部修改栏' : '显示底部修改栏'}
          >
            <OperationPanelIcon className="h-3.5 w-3.5" />
            修改栏
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => importInputRef.current?.click()}
            title="导入校对 JSON"
          >
            <Upload className="h-3.5 w-3.5" />
            导入
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onExportReviewMarks}
            title="导出校对 JSON"
          >
            <Download className="h-3.5 w-3.5" />
            导出
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrev}
            disabled={currentIndex <= 0}
            title="上一条校对行 (K)"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            <KeyboardHint>K</KeyboardHint>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNext}
            disabled={
              currentIndex < 0 || currentIndex >= filteredLines.length - 1
            }
            title="下一条校对行 (J)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            <KeyboardHint>J</KeyboardHint>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onSaveAllDrafts}
            disabled={totalDrafts === 0 || isBusy}
          >
            提交全部 ({totalDrafts})<KeyboardHint>Ctrl+Shift+S</KeyboardHint>
          </Button>
        </Toolbar>
        <ScriptLineWorkbench
          lines={filteredLines}
          selectedLine={selectedLine}
          selectedLineKeys={visibleSelectedLineKeys}
          onSelectLine={handleSelectReviewLine}
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
          highlightDirty={(line) => lineKey(line) in drafts}
          renderLineBadges={(line) => (
            <LineReviewBadges
              status={reviewMarks[lineKey(line)]?.status ?? 'unreviewed'}
              hasNote={Boolean(reviewMarks[lineKey(line)]?.note?.trim())}
              hasDraft={lineKey(line) in drafts}
              hasDiagnostic={diagnosticKeys.has(lineKey(line))}
            />
          )}
          emptyTitle="当前筛选没有校对行"
          emptyDescription="调整左侧筛选条件，或确认脚本中存在对白、旁白或选项行。"
          showOperationPanel={showLineOperationPanel}
          searchMatchLineKeys={searchMatchLineKeys}
        />
      </section>
      <SidebarResizeHandle
        onPointerDown={rightSidebar.startResize}
        label="调整校对详情侧栏宽度"
      />

      <ReviewInspector
        line={selectedLine}
        chapter={selectedChapter}
        dirty={dirty}
        status={selectedLineStatus}
        mark={selectedLine ? reviewMarks[lineKey(selectedLine)] : undefined}
        operationCount={operationLines.length}
        diagnostics={
          selectedLine ? diagnosticsForLine(diagnostics, selectedLine) : []
        }
        onMark={handleMarkAndAdvance}
        onClear={handleClearAndAdvance}
        onChangeNote={(note) =>
          selectedLine && onUpdateReviewNote(selectedLine, note)
        }
        onJumpToLine={onJumpToLine}
      />
    </main>
  )
}

function ReviewQueueSidebar({
  scope,
  setScope,
  query,
  setQuery,
  speakerFilter,
  setSpeakerFilter,
  chapterId,
  setChapterId,
  speakers,
  chapters,
  totalLines,
  filteredLines,
  totalDrafts,
  diagnosticCount,
  unreviewedCount,
  approvedCount,
  needsChangeCount,
  ignoredCount,
  noteCount,
  searchMatchCount,
  searchMatchPosition,
  onNavigateSearch,
}: {
  scope: ReviewScope
  setScope: (scope: ReviewScope) => void
  query: string
  setQuery: (query: string) => void
  speakerFilter: string
  setSpeakerFilter: (speaker: string) => void
  chapterId: string
  setChapterId: (chapterId: string) => void
  speakers: string[]
  chapters: ChapterRegistryItem[]
  totalLines: number
  filteredLines: number
  totalDrafts: number
  diagnosticCount: number
  unreviewedCount: number
  approvedCount: number
  needsChangeCount: number
  ignoredCount: number
  noteCount: number
  searchMatchCount: number
  searchMatchPosition: number
  onNavigateSearch: (delta: 1 | -1) => void
}) {
  const items: {
    key: ReviewScope
    label: string
    count: number
    icon: React.ReactNode
  }[] = [
    {
      key: 'all',
      label: '全部校对行',
      count: totalLines,
      icon: <PencilLine className="h-3.5 w-3.5" />,
    },
    {
      key: 'unreviewed',
      label: '未校对',
      count: unreviewedCount,
      icon: <Circle className="h-3.5 w-3.5" />,
    },
    {
      key: 'needs-change',
      label: '需修改',
      count: needsChangeCount,
      icon: <MessageSquareWarning className="h-3.5 w-3.5" />,
    },
    {
      key: 'approved',
      label: '已通过',
      count: approvedCount,
      icon: <Check className="h-3.5 w-3.5" />,
    },
    {
      key: 'dirty',
      label: '有草稿',
      count: totalDrafts,
      icon: <PencilLine className="h-3.5 w-3.5" />,
    },
    {
      key: 'noted',
      label: '有备注',
      count: noteCount,
      icon: <MessageSquareWarning className="h-3.5 w-3.5" />,
    },
    {
      key: 'diagnostic',
      label: '有诊断',
      count: diagnosticCount,
      icon: <MessageSquareWarning className="h-3.5 w-3.5" />,
    },
    {
      key: 'ignored',
      label: '已忽略',
      count: ignoredCount,
      icon: <EyeOff className="h-3.5 w-3.5" />,
    },
  ]
  const hasSearchQuery = query.trim().length > 0

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-border bg-card">
      <div className="space-y-2 border-b border-border p-3">
        <p className="text-xs font-bold">校对队列</p>
        <div className="flex items-center gap-1">
          <input
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-secondary px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"
            placeholder="搜索路径 / 行号 / 角色 / 正文"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onNavigateSearch(-1)}
            disabled={searchMatchCount === 0}
            title="上一个搜索命中"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onNavigateSearch(1)}
            disabled={searchMatchCount === 0}
            title="下一个搜索命中"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {filteredLines}/{totalLines} 行 · {totalDrafts} 行有草稿
          {hasSearchQuery &&
            ` · ${searchMatchPosition > 0 ? `${searchMatchPosition}/` : ''}${searchMatchCount} 命中`}
        </p>
      </div>
      <div className="space-y-3 overflow-auto scrollbar-thin p-3">
        <div className="grid gap-1">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setScope(item.key)}
              className={cn(
                'flex h-8 items-center gap-2 rounded-md px-2 text-left text-xs transition-colors hover:bg-secondary',
                scope === item.key && 'bg-accent text-accent-foreground',
              )}
            >
              {item.icon}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {item.count}
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-2 border-t border-border pt-3">
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">章节</span>
            <select
              value={chapterId}
              onChange={(event) => setChapterId(event.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs"
            >
              <option value="all">全部章节</option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.title}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">角色</span>
            <select
              value={speakerFilter}
              onChange={(event) => setSpeakerFilter(event.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs"
            >
              <option value="all">全部角色</option>
              {speakers.map((speaker) => (
                <option key={speaker} value={speaker}>
                  {speaker}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </aside>
  )
}

function LineReviewBadges({
  status,
  hasNote,
  hasDraft,
  hasDiagnostic,
}: {
  status: ReviewStatus
  hasNote: boolean
  hasDraft: boolean
  hasDiagnostic: boolean
}) {
  return (
    <>
      {hasDiagnostic && (
        <span className="h-2 w-2 rounded-full bg-destructive" title="有诊断" />
      )}
      {hasDraft && (
        <span className="h-2 w-2 rounded-full bg-warning" title="有草稿" />
      )}
      {hasNote && (
        <span className="h-2 w-2 rounded-full bg-info" title="有备注" />
      )}
      {status !== 'unreviewed' && (
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            status === 'approved' && 'bg-success',
            status === 'needs-change' && 'bg-warning',
            status === 'ignored' && 'bg-muted-foreground',
          )}
          title={statusLabels[status]}
        />
      )}
    </>
  )
}

function ReviewInspector({
  line,
  chapter,
  dirty,
  status,
  mark,
  operationCount,
  diagnostics,
  onMark,
  onClear,
  onChangeNote,
  onJumpToLine,
}: {
  line?: RpyLine
  chapter?: ChapterRegistryItem
  dirty: boolean
  status: ReviewStatus
  mark?: ReviewMark
  operationCount: number
  diagnostics: Diagnostic[]
  onMark: (status: Exclude<ReviewStatus, 'unreviewed'>) => void
  onClear: () => void
  onChangeNote: (note: string) => void
  onJumpToLine: (filePath: string, lineNumber: number) => void
}) {
  return (
    <aside className="flex h-full flex-col overflow-hidden border-l border-border bg-card">
      <div className="border-b border-border p-4">
        <h2 className="text-base font-semibold">校对详情</h2>
      </div>
      <div className="flex-1 space-y-4 overflow-auto scrollbar-thin p-4">
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">状态</span>
            <Badge variant={statusVariants[status]}>
              {statusLabels[status]}
            </Badge>
          </div>
          {operationCount > 1 && (
            <p className="text-[11px] text-muted-foreground">
              批量操作 {operationCount} 行
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={status === 'approved' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onMark('approved')}
              disabled={operationCount === 0}
            >
              <Check className="h-3.5 w-3.5" />
              通过
              <KeyboardHint>1</KeyboardHint>
            </Button>
            <Button
              variant={status === 'needs-change' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onMark('needs-change')}
              disabled={operationCount === 0}
            >
              <MessageSquareWarning className="h-3.5 w-3.5" />
              需修改
              <KeyboardHint>2</KeyboardHint>
            </Button>
            <Button
              variant={status === 'ignored' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onMark('ignored')}
              disabled={operationCount === 0}
            >
              <EyeOff className="h-3.5 w-3.5" />
              忽略
              <KeyboardHint>3</KeyboardHint>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClear}
              disabled={operationCount === 0}
            >
              <Circle className="h-3.5 w-3.5" />
              重置
              <KeyboardHint>0</KeyboardHint>
            </Button>
          </div>
          {mark && (
            <p className="text-[11px] text-muted-foreground">
              更新于 {new Date(mark.updatedAt).toLocaleString()}
            </p>
          )}
        </section>

        <section className="space-y-2 border-t border-border pt-3">
          <label className="grid gap-1 text-xs">
            <span className="font-bold">备注 / 修改意见</span>
            <Textarea
              value={mark?.note ?? ''}
              onChange={(event) => onChangeNote(event.target.value)}
              disabled={!line}
              placeholder="记录校对意见、修改建议或交接说明"
              className="min-h-24 resize-y text-xs"
            />
          </label>
        </section>

        <section className="space-y-1 border-t border-border pt-3">
          <DetailRow
            label="章节"
            value={chapter?.title ?? '-'}
            monospace={false}
          />
          <DetailRow label="文件" value={line?.filePath ?? '-'} />
          <DetailRow label="行号" value={String(line?.lineNumber ?? '-')} />
          <LineJumpButton
            filePath={line?.filePath}
            lineNumber={line?.lineNumber}
            onJump={onJumpToLine}
            label="定位"
            className="w-full justify-start"
          />
          <DetailRow label="类型" value={line?.kind ?? '-'} />
          <DetailRow label="角色" value={line?.characterId ?? '旁白'} />
          <DetailRow
            label="编辑"
            value={
              line?.editable ? (dirty ? '有未保存修改' : '已同步') : '只读'
            }
          />
        </section>

        {diagnostics.length > 0 && (
          <section className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-bold">诊断</p>
            {diagnostics.map((diagnostic) => (
              <div
                key={diagnostic.id}
                className="rounded-md border border-border bg-secondary p-2 text-xs"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <Badge
                    variant={
                      diagnostic.severity === 'error'
                        ? 'error'
                        : diagnostic.severity === 'warning'
                          ? 'warning'
                          : 'info'
                    }
                  >
                    {diagnostic.severity}
                  </Badge>
                </div>
                <p>{diagnostic.message}</p>
                {diagnostic.hint && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {diagnostic.hint}
                  </p>
                )}
              </div>
            ))}
          </section>
        )}
      </div>
    </aside>
  )
}

function scopeLabel(scope: ReviewScope) {
  if (scope === 'all') return '全部校对行'
  if (scope === 'chapter') return '当前章节'
  if (scope === 'dirty') return '有草稿'
  if (scope === 'noted') return '有备注'
  if (scope === 'diagnostic') return '有诊断'
  return statusLabels[scope]
}

function diagnosticsForLine(diagnostics: Diagnostic[], line: RpyLine) {
  const key = lineKey(line)
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.filePath &&
      diagnostic.lineNumber &&
      `${diagnostic.filePath}:${diagnostic.lineNumber}` === key,
  )
}

function setsEqual<T>(left: Set<T>, right: Set<T>) {
  if (left.size !== right.size) return false
  for (const item of left) {
    if (!right.has(item)) return false
  }
  return true
}
