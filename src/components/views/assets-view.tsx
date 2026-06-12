import { useMemo, useState } from 'react'
import { Copy, FolderTree, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AudioPreview,
  CharacterAvatar,
  DetailRow,
  EmptyState,
  ImagePreview,
  LineJumpButton,
  SidebarResizeHandle,
  StateThumbnail,
  Toolbar,
} from '@/components/shared'
import { useResizableSidebar } from '@/hooks/useResizableSidebar'
import {
  assetReference,
  assetTabs,
  categoryLabel,
  characterPreviewState,
  getAudioAssetRows,
  getCharacterAssetRows,
  getChapterAssetRows,
  getImageAssetRows,
} from '@/appHelpers'
import { cn } from '@/lib/cn'
import type {
  AssetCategory,
  AssetFilterCategory,
  AssetRow,
  AssetTab,
  CharacterRegistryItem,
  ChapterRegistryItem,
  WorkspaceSnapshot,
} from '@/types'
import {
  categoryFromPathHeuristic,
  type AssetPathRule,
} from '@/services/asset-rules'
import { normalizeRuntimePath } from '@/services/path-utils'

type AssetSection = AssetTab

const sections: { key: AssetSection; label: string }[] = [
  ...assetTabs.map((tab) => ({ key: tab.key as AssetSection, label: tab.label })),
]

const imageCategories: { value: AssetFilterCategory; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'character', label: '角色立绘' },
  { value: 'cg', label: 'CG' },
  { value: 'bg', label: '背景' },
  { value: 'fx', label: '特效' },
  { value: 'ui', label: 'UI' },
  { value: 'unreferenced', label: '未引用' },
]

const audioCategories: { value: AssetFilterCategory; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'bgm', label: 'BGM' },
  { value: 'sfx', label: '音效' },
  { value: 'voice', label: '语音' },
  { value: 'unreferenced', label: '未引用' },
]

interface DirectoryOption {
  path: string
  pattern: string
  count: number
  category: AssetCategory
}

export function AssetsView({
  snapshot,
  assetTab,
  setAssetTab,
  selectedAssetId,
  onSelectAsset,
  onCopy,
  onUpdateCharacter,
  onUpdateChapter,
  onJumpToLine,
  rules,
  setRules,
}: {
  snapshot?: WorkspaceSnapshot
  assetTab: AssetTab
  setAssetTab: (tab: AssetTab) => void
  selectedAssetId?: string
  onSelectAsset: (id: string) => void
  onCopy: (value: string, label: string) => void
  onUpdateCharacter: (
    id: string,
    patch: Partial<Pick<CharacterRegistryItem, 'displayName' | 'color' | 'note'>>,
  ) => void
  onUpdateChapter: (
    id: string,
    patch: Partial<Pick<ChapterRegistryItem, 'title' | 'order' | 'note'>>,
  ) => void
  onJumpToLine: (filePath: string, lineNumber: number) => void
  rules: AssetPathRule[]
  setRules: (rules: AssetPathRule[]) => void
}) {
  const leftSidebar = useResizableSidebar({
    key: 'rpy-tool:sidebar:assets-left',
    initial: 260,
    min: 210,
    edge: 'right',
  })
  const [section, setSection] = useState<AssetSection>(assetTab)
  const [filter, setFilter] = useState<AssetFilterCategory>('all')
  const [query, setQuery] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)

  const rows = useMemo(() => {
    if (!snapshot) return []
    if (section === 'characters') return getCharacterAssetRows(snapshot, query)
    if (section === 'images') return getImageAssetRows(snapshot, filter, query)
    if (section === 'audio') return getAudioAssetRows(snapshot, filter, query)
    return getChapterAssetRows(snapshot, query)
  }, [snapshot, section, filter, query])

  function handleSection(next: AssetSection) {
    setSection(next)
    setAssetTab(next)
    setFilter('all')
    setQuery('')
  }

  const selectedAsset = rows.find((row) => row.id === selectedAssetId) ?? rows[0]
  const filterOptions =
    section === 'images'
      ? imageCategories
      : section === 'audio'
        ? audioCategories
        : null

  return (
    <main
      className="grid h-[calc(100vh-var(--shell-chrome))] overflow-hidden"
      style={{
        gridTemplateColumns: `${leftSidebar.width}px 12px minmax(0,1fr)`,
      }}
    >
      <aside className="flex h-full flex-col overflow-hidden border-r border-border bg-card">
        <SectionTabs section={section} onChange={handleSection} />

        <div className="space-y-2 border-b border-border p-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              section === 'characters'
                ? '搜索角色…'
                : section === 'chapters'
                  ? '搜索 label…'
                  : '搜索路径或标签…'
            }
            className="h-8 w-full rounded-md border border-border bg-secondary px-2 text-xs"
          />
          {filterOptions && (
            <div className="flex flex-wrap gap-1">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={cn(
                    'rounded px-2 py-1 text-[11px] font-semibold transition-colors',
                    filter === option.value
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-secondary',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">{rows.length} 条候选</p>
        </div>

        <div className="flex-1 overflow-auto scrollbar-thin">
          {section === 'characters' ? (
            <CharacterList
              rows={rows}
              selectedId={selectedAsset?.id}
              onSelect={onSelectAsset}
              files={snapshot?.files ?? []}
            />
          ) : (
            <PlainList rows={rows} selectedId={selectedAsset?.id} onSelect={onSelectAsset} />
          )}
        </div>
      </aside>
      <SidebarResizeHandle onPointerDown={leftSidebar.startResize} />

      <section className="flex h-full flex-col overflow-hidden">
        <Toolbar
          title={selectedAsset?.title ?? sections.find((s) => s.key === section)?.label ?? '资产管理'}
          subtitle={selectedAsset?.meta ?? `${rows.length} 个候选`}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRulesOpen(true)}
          >
            路径规则 ({rules.length})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => selectedAsset?.path && onCopy(selectedAsset.path, '资源路径')}
            disabled={!selectedAsset?.path}
          >
            <Copy className="h-3.5 w-3.5" />
            复制路径
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => selectedAsset && onCopy(assetReference(selectedAsset), 'RenPy 引用')}
            disabled={!selectedAsset}
          >
            <Copy className="h-3.5 w-3.5" />
            复制引用
          </Button>
        </Toolbar>
        <AssetInspector
          section={section}
          selectedAsset={selectedAsset}
          onUpdateCharacter={onUpdateCharacter}
          onUpdateChapter={onUpdateChapter}
          onJumpToLine={onJumpToLine}
          files={snapshot?.files ?? []}
        />
      </section>
      {rulesOpen && (
        <RulesDialog
          rules={rules}
          setRules={setRules}
          snapshot={snapshot}
          onClose={() => setRulesOpen(false)}
        />
      )}
    </main>
  )
}

function SectionTabs({
  section,
  onChange,
}: {
  section: AssetSection
  onChange: (next: AssetSection) => void
}) {
  return (
    <div className="border-b border-border p-2">
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-secondary p-1">
        {sections.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              'rounded px-2 py-1.5 text-[11px] font-semibold transition-colors',
              tab.key === section
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function CharacterList({
  rows,
  selectedId,
  onSelect,
  files,
}: {
  rows: AssetRow[]
  selectedId?: string
  onSelect: (id: string) => void
  files: WorkspaceSnapshot['files']
}) {
  if (rows.length === 0) return <EmptyState title="暂无角色" />
  return (
    <div className="grid gap-2 p-2">
      {rows.map((row) => {
        const isSelected = row.id === selectedId
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => onSelect(row.id)}
            className={cn(
              'flex items-center gap-3 rounded-md border border-border bg-card p-2 text-left transition-colors hover:border-border-strong',
              isSelected && 'border-info bg-accent',
            )}
          >
            {row.character && (
              <CharacterAvatar
                character={row.character}
                files={files}
                className="h-12 w-12 flex-shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-xs">{row.title}</strong>
              <span className="block truncate text-[11px] text-muted-foreground">
                {row.meta}
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function PlainList({
  rows,
  selectedId,
  onSelect,
}: {
  rows: AssetRow[]
  selectedId?: string
  onSelect: (id: string) => void
}) {
  if (rows.length === 0) return <EmptyState title="暂无候选" />
  return (
    <div>
      {rows.slice(0, 300).map((row) => {
        const isSelected = row.id === selectedId
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => onSelect(row.id)}
            className={cn(
              'flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left transition-colors hover:bg-secondary',
              isSelected && 'bg-accent',
              row.referenced === false && 'opacity-70',
            )}
            title={row.title}
          >
            <strong className="w-full truncate text-xs">{row.title}</strong>
            <span className="w-full truncate text-[11px] text-muted-foreground">
              {row.meta}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function AssetInspector({
  section,
  selectedAsset,
  onUpdateCharacter,
  onUpdateChapter,
  onJumpToLine,
  files,
}: {
  section: AssetSection
  selectedAsset?: AssetRow
  onUpdateCharacter: (
    id: string,
    patch: Partial<Pick<CharacterRegistryItem, 'displayName' | 'color' | 'note'>>,
  ) => void
  onUpdateChapter: (
    id: string,
    patch: Partial<Pick<ChapterRegistryItem, 'title' | 'order' | 'note'>>,
  ) => void
  onJumpToLine: (filePath: string, lineNumber: number) => void
  files: WorkspaceSnapshot['files']
}) {
  const previewState = selectedAsset?.character
    ? characterPreviewState(selectedAsset.character)
    : undefined

  if (!selectedAsset) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <EmptyState title="选择左侧条目查看详情" className="flex-1" />
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto scrollbar-thin bg-background p-4">
      <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-card p-4">
            <h2 className="truncate text-lg font-semibold" title={selectedAsset.title}>
              {selectedAsset.title}
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {selectedAsset.meta}
            </p>
          </div>

          {selectedAsset.character && (
            <CharacterEditor
              character={selectedAsset.character}
              onUpdate={(patch) => onUpdateCharacter(selectedAsset.character!.id, patch)}
            />
          )}

          {selectedAsset.chapter && (
            <ChapterEditor
              chapter={selectedAsset.chapter}
              onUpdate={(patch) => onUpdateChapter(selectedAsset.chapter!.id, patch)}
              onJumpToLine={onJumpToLine}
            />
          )}

          {selectedAsset.referenced === false && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-[11px] text-warning-foreground">
              <Badge variant="warning">未引用</Badge>
              <p className="mt-1.5">该资源尚未被脚本引用，可能是临时素材或命名不一致。</p>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-md border border-border bg-card p-4">
        <DetailRow
          label="类型"
          value={sections.find((s) => s.key === section)?.label ?? '-'}
          monospace={false}
        />
        <DetailRow label="标签" value={selectedAsset.tags || '-'} monospace={false} />

        {selectedAsset.character && previewState && (
          <>
            <StateThumbnail
              state={previewState}
              character={selectedAsset.character}
              files={files}
              className="min-h-56 w-full p-2"
              imageClassName="max-h-80"
            />
            <DetailRow label="代表立绘" value={previewState.imageTag} />
            <LineJumpButton
              filePath={previewState.sourceFile}
              lineNumber={previewState.lineNumber}
              onJump={onJumpToLine}
              label="image 定义"
              className="w-full justify-start"
            />
          </>
        )}

        {selectedAsset.chapter && (
          <LineJumpButton
            filePath={selectedAsset.chapter.filePath}
            lineNumber={selectedAsset.chapter.lineNumber}
            onJump={onJumpToLine}
            label="label"
            className="w-full justify-start"
          />
        )}

        {selectedAsset.file?.kind === 'image' && (
          <ImagePreview file={selectedAsset.file} />
        )}
        {selectedAsset.file?.kind === 'audio' && (
          <AudioPreview file={selectedAsset.file} />
        )}
        </div>
      </div>
    </div>
  )
}

function CharacterEditor({
  character,
  onUpdate,
}: {
  character: CharacterRegistryItem
  onUpdate: (
    patch: Partial<Pick<CharacterRegistryItem, 'displayName' | 'color' | 'note'>>,
  ) => void
}) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-secondary p-3">
      <label className="grid gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          显示名
        </span>
        <input
          type="text"
          value={character.displayName}
          onChange={(event) => onUpdate({ displayName: event.target.value })}
          className="h-8 rounded-md border border-border bg-card px-2 text-sm"
        />
      </label>
      <label className="grid gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          颜色
        </span>
        <div className="flex gap-2">
          <input
            type="color"
            value={character.color ?? '#64748b'}
            onChange={(event) => onUpdate({ color: event.target.value })}
            className="h-8 w-10 cursor-pointer rounded-md border border-border bg-card p-0.5"
          />
          <input
            type="text"
            value={character.color ?? ''}
            onChange={(event) => onUpdate({ color: event.target.value })}
            placeholder="#000000"
            className="h-8 flex-1 rounded-md border border-border bg-card px-2 font-mono text-xs"
          />
        </div>
      </label>
      <label className="grid gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          备注
        </span>
        <textarea
          value={character.note ?? ''}
          onChange={(event) => onUpdate({ note: event.target.value })}
          rows={3}
          placeholder="角色档案 / 写作约束"
          className="rounded-md border border-border bg-card p-2 text-sm"
        />
      </label>
    </div>
  )
}

function ChapterEditor({
  chapter,
  onUpdate,
  onJumpToLine,
}: {
  chapter: ChapterRegistryItem
  onUpdate: (
    patch: Partial<Pick<ChapterRegistryItem, 'title' | 'order' | 'note'>>,
  ) => void
  onJumpToLine: (filePath: string, lineNumber: number) => void
}) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-secondary p-3">
      <label className="grid gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          标题
        </span>
        <input
          type="text"
          value={chapter.title}
          onChange={(event) => onUpdate({ title: event.target.value })}
          className="h-8 rounded-md border border-border bg-card px-2 text-sm"
        />
      </label>
      <label className="grid gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          顺序
        </span>
        <input
          type="number"
          value={chapter.order}
          onChange={(event) => onUpdate({ order: Number(event.target.value) || 0 })}
          className="h-8 rounded-md border border-border bg-card px-2 text-sm"
        />
      </label>
      <label className="grid gap-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          备注
        </span>
        <textarea
          value={chapter.note ?? ''}
          onChange={(event) => onUpdate({ note: event.target.value })}
          rows={3}
          placeholder="章节摘要"
          className="rounded-md border border-border bg-card p-2 text-sm"
        />
      </label>
      <LineJumpButton
        filePath={chapter.filePath}
        lineNumber={chapter.lineNumber}
        onJump={onJumpToLine}
        label="跳转到 label"
        className="w-full justify-start"
      />
    </div>
  )
}

function RulesDialog({
  rules,
  setRules,
  snapshot,
  onClose,
}: {
  rules: AssetPathRule[]
  setRules: (rules: AssetPathRule[]) => void
  snapshot?: WorkspaceSnapshot
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-rules-title"
        className="flex h-[min(760px,88vh)] w-[min(980px,94vw)] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
          <div>
            <h2 id="asset-rules-title" className="text-base font-semibold">
              资产路径规则
            </h2>
            <p className="text-[11px] text-muted-foreground">
              按优先级匹配路径，决定图片和音频资源分类。
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} title="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <RulesEditor rules={rules} setRules={setRules} snapshot={snapshot} />
      </div>
    </div>
  )
}

function RulesEditor({
  rules,
  setRules,
  snapshot,
}: {
  rules: AssetPathRule[]
  setRules: (rules: AssetPathRule[]) => void
  snapshot?: WorkspaceSnapshot
}) {
  const [activeRuleId, setActiveRuleId] = useState<string | undefined>(rules[0]?.id)

  const directoryOptions = useMemo(
    () => buildDirectoryOptions(snapshot),
    [snapshot],
  )
  const directorySidebar = useResizableSidebar({
    key: 'rpy-tool:sidebar:asset-rules-directories',
    initial: 300,
    min: 240,
    edge: 'left',
  })

  function addRule() {
    const id = nextRuleId(rules)
    setRules([
      ...rules,
      {
        id,
        pattern: '',
        category: 'cg',
        priority: 50,
        enabled: true,
      },
    ])
    setActiveRuleId(id)
  }

  function updateRule(id: string, patch: Partial<AssetPathRule>) {
    setRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function deleteRule(id: string) {
    setRules(rules.filter((r) => r.id !== id))
    if (activeRuleId === id) {
      setActiveRuleId(rules.find((rule) => rule.id !== id)?.id)
    }
  }

  function applyDirectory(option: DirectoryOption) {
    if (activeRuleId && rules.some((rule) => rule.id === activeRuleId)) {
      updateRule(activeRuleId, {
        pattern: option.pattern,
        category: option.category,
      })
      return
    }
    const id = nextRuleId(rules)
    setRules([
      ...rules,
      {
        id,
        pattern: option.pattern,
        category: option.category,
        priority: 50,
        enabled: true,
      },
    ])
    setActiveRuleId(id)
  }

  const categories: AssetCategory[] = [
    'character', 'cg', 'bg', 'fx', 'bgm', 'sfx', 'voice', 'ui',
  ]

  return (
    <section className="flex h-full flex-col overflow-hidden">
      <Toolbar
        title="资产路径规则"
        subtitle={`${rules.length} 条规则 · 保存后下次扫描自动应用`}
      >
        <Button variant="default" size="sm" onClick={addRule}>
          <Plus className="h-3.5 w-3.5" />
          新建规则
        </Button>
      </Toolbar>
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin p-4">
        <div
          className="grid min-h-full gap-0"
          style={{
            gridTemplateColumns: `minmax(0,1fr) 12px ${directorySidebar.width}px`,
          }}
        >
          <div className="space-y-2">
            {rules
              .slice()
              .sort((a, b) => b.priority - a.priority)
              .map((rule) => (
                <div
                  key={rule.id}
                  onFocus={() => setActiveRuleId(rule.id)}
                  onClick={() => setActiveRuleId(rule.id)}
                  className={cn(
                    'grid grid-cols-[minmax(0,2fr)_minmax(120px,1fr)_80px_60px_auto] items-center gap-3 rounded-md border border-border bg-card p-3',
                    !rule.enabled && 'opacity-60',
                    activeRuleId === rule.id && 'border-info ring-1 ring-info/30',
                  )}
                >
                  <input
                    type="text"
                    value={rule.pattern}
                    onChange={(event) => updateRule(rule.id, { pattern: event.target.value })}
                    placeholder="images/characters/**/*"
                    className="h-8 min-w-0 rounded-md border border-border bg-card px-2 font-mono text-xs"
                  />
                  <select
                    value={rule.category}
                    onChange={(event) =>
                      updateRule(rule.id, { category: event.target.value as AssetCategory })
                    }
                    title="资产分类"
                    aria-label="资产分类"
                    className="h-8 min-w-0 rounded-md border border-border bg-card px-2 text-xs"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {categoryLabel[cat]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={rule.priority}
                    onChange={(event) =>
                      updateRule(rule.id, { priority: Number(event.target.value) || 0 })
                    }
                    title="优先级（高优先级先匹配）"
                    className="h-8 rounded-md border border-border bg-card px-2 text-xs"
                  />
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={(event) => updateRule(rule.id, { enabled: event.target.checked })}
                      className="h-3 w-3"
                    />
                    启用
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteRule(rule.id)}
                    title="删除规则"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            {rules.length === 0 && (
              <EmptyState
                title="暂无路径规则"
                description='点击右上角"新建规则"添加，或从右侧选择目录。'
              />
            )}
            {snapshot && rules.length > 0 && (
              <div className="mt-6 rounded-md border border-border bg-secondary p-3 text-xs">
                <strong>提示：</strong>规则保存后会自动重新分类资产。下次重新扫描时也会应用。
              </div>
            )}
          </div>
          <SidebarResizeHandle
            onPointerDown={directorySidebar.startResize}
            label="调整目录选择宽度"
          />

          <aside className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card">
            <div className="border-b border-border p-3">
              <div className="flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-info" />
                <h3 className="text-sm font-semibold">选择目录</h3>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                应用到当前高亮规则
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-auto scrollbar-thin p-2">
              {directoryOptions.map((option) => (
                <button
                  key={option.path}
                  type="button"
                  onClick={() => applyDirectory(option)}
                  className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary"
                  title={option.pattern}
                >
                  <strong className="w-full truncate font-mono text-[11px]">
                    {option.path}
                  </strong>
                  <span className="text-[10px] text-muted-foreground">
                    {option.count} 文件 · {categoryLabel[option.category]}
                  </span>
                </button>
              ))}
              {directoryOptions.length === 0 && (
                <EmptyState title="暂无资源目录" />
              )}
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}

function nextRuleId(rules: AssetPathRule[]) {
  let index = rules.length + 1
  let id = `rule-${index}`
  while (rules.some((rule) => rule.id === id)) {
    index += 1
    id = `rule-${index}`
  }
  return id
}

function buildDirectoryOptions(snapshot: WorkspaceSnapshot | undefined): DirectoryOption[] {
  if (!snapshot) return []
  const counts = new Map<string, number>()
  for (const file of snapshot.files) {
    if (!['image', 'audio'].includes(file.kind)) continue
    const normalized = normalizeRuntimePath(file.path)
    const parts = normalized.split('/').filter(Boolean)
    for (let index = 1; index < parts.length; index += 1) {
      const dir = parts.slice(0, index).join('/')
      counts.set(dir, (counts.get(dir) ?? 0) + 1)
    }
  }

  return Array.from(counts.entries())
    .map(([path, count]) => ({
      path,
      count,
      pattern: `${path}/**/*`,
      category: categoryFromPathHeuristic(`${path}/sample.png`),
    }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, 160)
}
