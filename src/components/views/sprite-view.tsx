import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  SPRITE_CARD_SCALE_MAX,
  SPRITE_CARD_SCALE_MIN,
  SPRITE_CARD_SCALE_STEP,
} from '@/services/settings'
import {
  DetailRow,
  EmptyState,
  KeyboardHint,
  LineJumpButton,
  LineList,
  OriginalLineCode,
  SidebarResizeHandle,
  StateThumbnail,
  Toolbar,
} from '@/components/shared'
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
  CharacterRegistryItem,
  CharacterState,
  RpyLine,
  WorkspaceSnapshot,
} from '@/types'

type SpriteScope = 'all' | 'with-character' | 'dialogue' | 'dirty'

const emptyChapters: ChapterRegistryItem[] = []
const emptyCharacters: CharacterRegistryItem[] = []

export function SpriteView({
  snapshot,
  selectedLine,
  selectedState,
  onSelectLine,
  onSelectState,
  onApplyState,
  onJumpToDefinition,
  isBusy,
  drafts,
  spriteCardScale,
  onSpriteCardScaleChange,
}: {
  snapshot?: WorkspaceSnapshot
  selectedLine?: RpyLine
  selectedState?: CharacterState
  onSelectLine: (line: RpyLine) => void
  onSelectState: (id: string | undefined) => void
  onApplyState: (state: CharacterState) => void
  onJumpToDefinition: (filePath: string, lineNumber: number) => void
  isBusy: boolean
  drafts: Record<string, { text: string }>
  spriteCardScale: number
  onSpriteCardScaleChange: (scale: number) => void
}) {
  const leftSidebar = useResizableSidebar({
    key: 'rpy-tool:sidebar:sprite-left',
    initial: 280,
    min: 220,
    edge: 'right',
  })
  const rightSidebar = useResizableSidebar({
    key: 'rpy-tool:sidebar:sprite-right',
    initial: 520,
    min: 420,
    edge: 'left',
  })
  const [scope, setScope] = useState<SpriteScope>('all')
  const [speakerFilter, setSpeakerFilter] = useState('all')
  const [chapterId, setChapterId] = useState('all')
  const [query, setQuery] = useState('')
  const chapters = snapshot?.index.chapters ?? emptyChapters
  const characters = snapshot?.index.characters ?? emptyCharacters
  const spriteLines = useMemo(
    () => (snapshot?.index.lines ?? []).filter((line) => line.editable),
    [snapshot],
  )
  const speakers = useMemo(
    () => uniqueValues(spriteLines.map((line) => line.characterId ?? '旁白')),
    [spriteLines],
  )
  const normalizedQuery = query.trim().toLowerCase()
  const characterById = useMemo(
    () => new Map(characters.map((character) => [character.id, character])),
    [characters],
  )
  const filteredLines = useMemo(
    () =>
      spriteLines
        .filter((line) => {
          if (scope === 'with-character') return Boolean(line.characterId)
          if (scope === 'dialogue') return line.kind === 'dialogue'
          if (scope === 'dirty') return lineKey(line) in drafts
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
    [chapterId, chapters, drafts, scope, speakerFilter, spriteLines],
  )
  const currentIndex = selectedLine
    ? filteredLines.findIndex((line) => lineKey(line) === lineKey(selectedLine))
    : -1
  const currentCharacter = characters.find(
    (character) => character.id === selectedLine?.characterId,
  )
  const currentStates = currentCharacter?.states ?? []
  const searchMatches = useMemo(() => {
    if (!normalizedQuery) return []
    return filteredLines.filter((line) => {
      const speakerName = line.characterId
        ? characterById.get(line.characterId)?.displayName
        : undefined
      const chapter = chapterForLine(chapters, line)
      const chapterMatches = chapter
        ? `${chapter.title} ${chapter.entryLabel}`
            .toLowerCase()
            .includes(normalizedQuery)
        : false
      return (
        chapterMatches || lineMatchesQuery(line, normalizedQuery, speakerName)
      )
    })
  }, [chapters, characterById, filteredLines, normalizedQuery])
  const searchMatchLineKeys = useMemo(
    () => new Set(searchMatches.map((line) => lineKey(line))),
    [searchMatches],
  )
  const totalWithCharacter = spriteLines.filter(
    (line) => line.characterId,
  ).length
  const totalDialogues = spriteLines.filter(
    (line) => line.kind === 'dialogue',
  ).length
  const totalDrafts = spriteLines.filter(
    (line) => lineKey(line) in drafts,
  ).length

  const selectLineAndSyncState = useCallback(
    (line: RpyLine) => {
      onSelectLine(line)
      const character = characters.find((item) => item.id === line.characterId)
      onSelectState(findStateForLine(line, character?.states ?? [])?.id)
    },
    [characters, onSelectLine, onSelectState],
  )

  const selectedLineKey = selectedLine ? lineKey(selectedLine) : undefined
  const searchMatchPosition = selectedLineKey
    ? searchMatches.findIndex((line) => lineKey(line) === selectedLineKey) + 1
    : 0
  const filteredLineKeys = useMemo(
    () => new Set(filteredLines.map((line) => lineKey(line))),
    [filteredLines],
  )

  useEffect(() => {
    if (filteredLines.length === 0) {
      if (selectedLineKey) onSelectState(undefined)
      return
    }
    if (!selectedLineKey || !filteredLineKeys.has(selectedLineKey)) {
      selectLineAndSyncState(filteredLines[0])
    }
  }, [
    filteredLineKeys,
    filteredLines,
    onSelectState,
    selectLineAndSyncState,
    selectedLineKey,
  ])

  function handlePrev() {
    if (currentIndex > 0)
      selectLineAndSyncState(filteredLines[currentIndex - 1])
  }

  function handleNext() {
    if (currentIndex >= 0 && currentIndex < filteredLines.length - 1) {
      selectLineAndSyncState(filteredLines[currentIndex + 1])
    }
  }

  function handleNavigateSearch(delta: 1 | -1) {
    if (searchMatches.length === 0) return
    const activeSearchIndex = selectedLineKey
      ? searchMatches.findIndex((line) => lineKey(line) === selectedLineKey)
      : -1
    if (activeSearchIndex >= 0) {
      const nextIndex =
        (activeSearchIndex + delta + searchMatches.length) %
        searchMatches.length
      selectLineAndSyncState(searchMatches[nextIndex])
      return
    }
    if (currentIndex < 0) {
      selectLineAndSyncState(
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
    selectLineAndSyncState(nextMatch.line)
  }

  return (
    <main
      className="grid h-[calc(100vh-var(--shell-chrome))] overflow-hidden"
      style={{
        gridTemplateColumns: `${leftSidebar.width}px 12px minmax(300px,1fr) 12px ${rightSidebar.width}px`,
      }}
    >
      <SpriteFilterSidebar
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
        characters={characters}
        totalLines={spriteLines.length}
        filteredLines={filteredLines.length}
        totalWithCharacter={totalWithCharacter}
        totalDialogues={totalDialogues}
        totalDrafts={totalDrafts}
        searchMatchCount={searchMatches.length}
        searchMatchPosition={searchMatchPosition}
        onNavigateSearch={handleNavigateSearch}
      />
      <SidebarResizeHandle onPointerDown={leftSidebar.startResize} />

      <section className="flex h-full flex-col overflow-hidden">
        <Toolbar
          title="快速插入立绘"
          subtitle={`${filteredLines.length}/${spriteLines.length} 行 · ${spriteScopeLabel(scope)} · ${
            currentCharacter?.displayName ??
            selectedLine?.characterId ??
            '未匹配角色'
          }`}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrev}
            disabled={currentIndex <= 0}
            title="上一行 (K)"
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
            title="下一行 (J)"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            <KeyboardHint>J</KeyboardHint>
          </Button>
        </Toolbar>
        <div className="min-h-0 flex-1">
          <LineList
            lines={filteredLines}
            selectedLine={selectedLine}
            onSelectLine={selectLineAndSyncState}
            characters={characters}
            files={snapshot?.files}
            speakerClassName="max-w-32"
            highlightDirty={(line) => lineKey(line) in drafts}
            searchMatchLineKeys={searchMatchLineKeys}
            emptyTitle="当前筛选没有可编辑行"
          />
        </div>
        <div className="border-t border-border bg-card p-3">
          <OriginalLineCode line={selectedLine} />
        </div>
      </section>
      <SidebarResizeHandle
        onPointerDown={rightSidebar.startResize}
        label="调整立绘详情宽度"
      />

      <SpriteInspector
        character={currentCharacter}
        states={currentStates}
        selectedState={selectedState}
        selectedLine={selectedLine}
        onSelectState={onSelectState}
        onApplyState={onApplyState}
        onJumpToDefinition={onJumpToDefinition}
        isBusy={isBusy}
        files={snapshot?.files ?? []}
        spriteCardScale={spriteCardScale}
        onSpriteCardScaleChange={onSpriteCardScaleChange}
      />
    </main>
  )
}

const SPRITE_CARD_BASE_WIDTH = 180
const SPRITE_THUMB_BASE_HEIGHT = 148
const SPRITE_IMAGE_BASE_MAX_HEIGHT = 220

function SpriteFilterSidebar({
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
  characters,
  totalLines,
  filteredLines,
  totalWithCharacter,
  totalDialogues,
  totalDrafts,
  searchMatchCount,
  searchMatchPosition,
  onNavigateSearch,
}: {
  scope: SpriteScope
  setScope: (scope: SpriteScope) => void
  query: string
  setQuery: (query: string) => void
  speakerFilter: string
  setSpeakerFilter: (speaker: string) => void
  chapterId: string
  setChapterId: (chapterId: string) => void
  speakers: string[]
  chapters: ChapterRegistryItem[]
  characters: CharacterRegistryItem[]
  totalLines: number
  filteredLines: number
  totalWithCharacter: number
  totalDialogues: number
  totalDrafts: number
  searchMatchCount: number
  searchMatchPosition: number
  onNavigateSearch: (delta: 1 | -1) => void
}) {
  const items: { key: SpriteScope; label: string; count: number }[] = [
    { key: 'all', label: '全部可编辑行', count: totalLines },
    { key: 'with-character', label: '有角色', count: totalWithCharacter },
    { key: 'dialogue', label: '对白', count: totalDialogues },
    { key: 'dirty', label: '有草稿', count: totalDrafts },
  ]
  const hasSearchQuery = query.trim().length > 0

  return (
    <aside className="flex h-full flex-col overflow-hidden border-r border-border bg-card">
      <div className="space-y-2 border-b border-border p-3">
        <p className="text-xs font-bold">立绘筛选</p>
        <div className="flex items-center gap-1">
          <input
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-secondary px-2 text-xs focus-visible:outline-2 focus-visible:outline-ring"
            placeholder="搜索章节 / 正文 / 角色"
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
          {filteredLines}/{totalLines} 行 · {totalWithCharacter} 行有角色
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
                  {speakerLabel(speaker, characters)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </aside>
  )
}

function spriteScopeLabel(scope: SpriteScope) {
  if (scope === 'with-character') return '有角色'
  if (scope === 'dialogue') return '对白'
  if (scope === 'dirty') return '有草稿'
  return '全部可编辑行'
}

function speakerLabel(speaker: string, characters: CharacterRegistryItem[]) {
  if (speaker === '旁白') return speaker
  const character = characters.find((item) => item.id === speaker)
  return character ? `${character.displayName} (${character.id})` : speaker
}

function findStateForLine(line: RpyLine, states: CharacterState[]) {
  if (!line.characterId || states.length === 0) return undefined
  const target = line.target?.trim() ?? ''
  if (!target) {
    return (
      states.find((state) => spriteAttributes(state) === '') ??
      states.find((state) => /default|normal|idle/i.test(state.label))
    )
  }
  const normalizedTarget = normalizeSpriteStateKey(target)
  return states.find((state) => {
    const attributes = spriteAttributes(state)
    return (
      normalizeSpriteStateKey(attributes) === normalizedTarget ||
      normalizeSpriteStateKey(state.label) === normalizedTarget ||
      normalizeSpriteStateKey(state.imageTag) === normalizedTarget
    )
  })
}

function spriteAttributes(state: CharacterState) {
  return state.imageTag.split(/\s+/).filter(Boolean).slice(1).join(' ')
}

function normalizeSpriteStateKey(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function SpriteInspector({
  character,
  states,
  selectedState,
  selectedLine,
  onSelectState,
  onApplyState,
  onJumpToDefinition,
  isBusy,
  files,
  spriteCardScale,
  onSpriteCardScaleChange,
}: {
  character?: CharacterRegistryItem
  states: CharacterState[]
  selectedState?: CharacterState
  selectedLine?: RpyLine
  onSelectState: (id: string | undefined) => void
  onApplyState: (state: CharacterState) => void
  onJumpToDefinition: (filePath: string, lineNumber: number) => void
  isBusy: boolean
  files: WorkspaceSnapshot['files']
  spriteCardScale: number
  onSpriteCardScaleChange: (scale: number) => void
}) {
  const canApply = selectedLine?.kind === 'dialogue'
  const safeScale = Math.min(
    SPRITE_CARD_SCALE_MAX,
    Math.max(SPRITE_CARD_SCALE_MIN, spriteCardScale),
  )
  const scaleRatio = safeScale / 100
  const cardWidth = Math.round(SPRITE_CARD_BASE_WIDTH * scaleRatio)
  const thumbnailHeight = Math.round(SPRITE_THUMB_BASE_HEIGHT * scaleRatio)
  const imageMaxHeight = Math.round(SPRITE_IMAGE_BASE_MAX_HEIGHT * scaleRatio)

  return (
    <aside
      className="flex h-full flex-col overflow-hidden border-l border-border bg-card"
      data-tour="sprite-inspector"
    >
      <div className="space-y-2 border-b border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="truncate text-base font-semibold">
            {character?.displayName ?? '当前行没有角色'}
          </h2>
          {character && <Badge variant="info">{states.length} 个立绘</Badge>}
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {selectedLine
            ? `${selectedLine.filePath}:${selectedLine.lineNumber}`
            : '请选择一行台词'}
        </p>
        <div
          className="flex items-center gap-3 rounded-md border border-border bg-secondary/70 px-3 py-2"
          data-tour="sprite-scale"
        >
          <label
            htmlFor="sprite-card-scale"
            className="shrink-0 text-[11px] font-medium text-muted-foreground"
          >
            缩放
          </label>
          <input
            id="sprite-card-scale"
            type="range"
            min={SPRITE_CARD_SCALE_MIN}
            max={SPRITE_CARD_SCALE_MAX}
            step={SPRITE_CARD_SCALE_STEP}
            value={safeScale}
            onChange={(event) =>
              onSpriteCardScaleChange(Number(event.currentTarget.value))
            }
            className="h-2 min-w-0 flex-1 cursor-pointer accent-info"
            aria-label="立绘卡片缩放"
          />
          <span className="w-10 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
            {safeScale}%
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto scrollbar-thin p-4">
        {!selectedLine ? (
          <EmptyState title="请选择一行台词" />
        ) : !character ? (
          <EmptyState
            title="当前行没有可匹配角色"
            description="选择角色对白行后，右侧会显示该角色所有 image 状态。"
          />
        ) : states.length === 0 ? (
          <EmptyState
            title="该角色还没有立绘"
            description="需要先在脚本中定义 image，或检查 Character(image=...) 映射。"
          />
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-secondary p-3">
              <DetailRow label="角色 id" value={character.id} />
              <DetailRow
                label="当前操作"
                value={canApply ? '改写对白头部' : '请选择对白行'}
                monospace={false}
              />
            </div>
            <div className="flex flex-wrap content-start gap-3">
              {states.map((state) => (
                <SpriteCard
                  key={state.id}
                  state={state}
                  character={character}
                  selected={state.id === selectedState?.id}
                  disabled={isBusy || !canApply}
                  onSelect={() => {
                    onSelectState(state.id)
                    if (canApply) onApplyState(state)
                  }}
                  onJumpToDefinition={onJumpToDefinition}
                  files={files}
                  cardWidth={cardWidth}
                  thumbnailHeight={thumbnailHeight}
                  imageMaxHeight={imageMaxHeight}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function SpriteCard({
  state,
  character,
  selected,
  disabled,
  onSelect,
  onJumpToDefinition,
  files,
  cardWidth,
  thumbnailHeight,
  imageMaxHeight,
}: {
  state: CharacterState
  character: CharacterRegistryItem
  selected: boolean
  disabled: boolean
  onSelect: () => void
  onJumpToDefinition: (filePath: string, lineNumber: number) => void
  files: WorkspaceSnapshot['files']
  cardWidth: number
  thumbnailHeight: number
  imageMaxHeight: number
}) {
  return (
    <div
      className={cn(
        'min-w-0 overflow-hidden rounded-md border border-border bg-card transition-colors',
        selected && 'border-info bg-accent ring-1 ring-info/30',
      )}
      style={
        {
          '--sprite-thumb-height': `${thumbnailHeight}px`,
          '--sprite-image-max-height': `${imageMaxHeight}px`,
          flex: `0 1 ${cardWidth}px`,
          width: `${cardWidth}px`,
        } as CSSProperties
      }
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className="flex w-full flex-col items-start gap-2 p-2.5 text-left transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
        title={state.imageTag}
      >
        <StateThumbnail
          state={state}
          character={character}
          files={files}
          className="h-[var(--sprite-thumb-height)] w-full self-center p-2"
          imageClassName="max-h-[var(--sprite-image-max-height)] w-auto"
        />
        <strong className="w-full truncate text-xs">{state.imageTag}</strong>
        <span className="w-full truncate text-[11px] text-muted-foreground">
          {state.path ?? '未绑定图片路径'}
        </span>
      </button>
      <div className="border-t border-border p-2">
        <LineJumpButton
          filePath={state.sourceFile}
          lineNumber={state.lineNumber}
          onJump={onJumpToDefinition}
          label="image 定义"
          className="w-full justify-start"
        />
      </div>
    </div>
  )
}
