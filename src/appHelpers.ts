import { cn } from '@/lib/cn'
import type {
  AssetTab,
  CharacterRegistryItem,
  CharacterState,
  ChapterRegistryItem,
  Diagnostic,
  FileEntry,
  RpyLine,
  RpyIndex,
  AssetRegistryItem,
  AssetFilterCategory,
  WorkspaceSnapshot,
  ViewKey,
  AssetRow,
  AssetCategory,
} from './types'
import {
  matchAssetCategory,
  categoryFromPathHeuristic,
  type AssetPathRule,
} from './services/asset-rules'

export const navigation: { key: ViewKey; label: string; hint: string }[] = [
  { key: 'home', label: '首页', hint: '统计 / 健康 / 诊断' },
  { key: 'visual', label: '可视化编辑器', hint: '逐行写作 + 立绘插入' },
  { key: 'review', label: '文本 Review', hint: '按章节复核' },
  { key: 'sprite', label: '立绘快插', hint: '所有 image 状态' },
  { key: 'assets', label: '资产管理', hint: '资源 / 角色 / 章节 / 路径规则' },
  { key: 'about', label: '关于', hint: '关于与主题' },
]

export const assetTabs: { key: AssetTab; label: string }[] = [
  { key: 'characters', label: '角色' },
  { key: 'images', label: '图片' },
  { key: 'audio', label: '音频' },
  { key: 'chapters', label: '章节' },
]

export const SOURCE_SIZE_LIMIT = 2 * 1024 * 1024

export interface JourneyStep {
  id: string
  title: string
  meta: string
  state: 'done' | 'active' | 'waiting'
  target: ViewKey
}

export function lineKey(line: RpyLine) {
  return `${line.filePath}:${line.lineNumber}`
}

export function lineMatchesQuery(
  line: RpyLine,
  normalizedQuery: string,
  speakerName?: string,
) {
  if (!normalizedQuery) return false
  return `${line.filePath} ${line.lineNumber} ${line.kind} ${line.characterId ?? ''} ${speakerName ?? ''} ${line.target ?? ''} ${line.text ?? ''} ${line.raw}`
    .toLowerCase()
    .includes(normalizedQuery)
}

export function firstEditableLine(snapshot?: WorkspaceSnapshot, filePath?: string) {
  if (!snapshot) return undefined
  return (
    snapshot.index.lines.find((line) => line.filePath === filePath && line.editable) ??
    snapshot.index.lines.find((line) => line.filePath === filePath) ??
    snapshot.index.lines.find((line) => line.editable) ??
    snapshot.index.lines[0]
  )
}

export function chapterForLine(chapters: ChapterRegistryItem[], line: RpyLine) {
  const sameFile = chapters.filter((chapter) => chapter.filePath === line.filePath)
  return (
    sameFile.filter((chapter) => chapter.lineNumber <= line.lineNumber).at(-1) ??
    sameFile[0] ??
    chapters[0]
  )
}

export function chapterEditableLines(
  snapshot: WorkspaceSnapshot | undefined,
  chapter: ChapterRegistryItem | undefined,
) {
  if (!snapshot) return []
  if (!chapter) return snapshot.index.lines.filter((line) => line.editable)
  const chaptersInFile = snapshot.index.chapters.filter(
    (item) => item.filePath === chapter.filePath,
  )
  const currentIndex = chaptersInFile.findIndex((item) => item.id === chapter.id)
  const nextChapter = chaptersInFile[currentIndex + 1]
  return snapshot.index.lines.filter(
    (line) =>
      line.filePath === chapter.filePath &&
      line.lineNumber > chapter.lineNumber &&
      (!nextChapter || line.lineNumber < nextChapter.lineNumber) &&
      line.editable,
  )
}

export function countKind(snapshot: WorkspaceSnapshot | undefined, kind: FileEntry['kind']) {
  return snapshot?.files.filter((file) => file.kind === kind).length ?? 0
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  )
}

export function assetReference(row: AssetRow) {
  if (row.state) return `show ${row.state.imageTag}`
  if (row.chapter) return `jump ${row.chapter.entryLabel}`
  if (row.file?.kind === 'audio') return `"${row.path ?? row.file.path}"`
  if (row.path) return `"${row.path}"`
  return row.title
}

export function isSourceEditable(file: FileEntry) {
  return (file.kind === 'rpy' || file.kind === 'text') && file.size <= SOURCE_SIZE_LIMIT
}

/**
 * Re-classify all assets in the index using user-defined path rules.
 */
export function reclassifyAssets(
  index: RpyIndex,
  rules: AssetPathRule[],
): RpyIndex {
  const next: AssetRegistryItem[] = index.assets.map((asset) => {
    const matched = matchAssetCategory(asset.path, rules)
    return {
      ...asset,
      category: matched ?? categoryFromPathHeuristic(asset.path),
    }
  })
  return { ...index, assets: next }
}

export function characterPreviewState(
  character: CharacterRegistryItem,
): CharacterState | undefined {
  // 优先选择名为 default/normal/idle 的状态
  const preferred = character.states.find((state) =>
    /default|normal|idle|smile|happy/.test(state.label.toLowerCase()),
  )
  return preferred ?? character.states[0]
}

/**
 * 按用户路径规则将图片资产分组。
 * - 若资产被 image 定义引用，标记 referenced=true
 * - 角色立绘 (category === 'character') 仍可被列入图片管理（路径分类）
 */
export function getImageAssetRows(
  snapshot: WorkspaceSnapshot,
  filter: AssetFilterCategory,
  query: string,
): AssetRow[] {
  const normalized = query.trim().toLowerCase()
  const imageAssets = snapshot.index.assets.filter(
    (asset) => asset.file?.kind === 'image' || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(asset.path),
  )

  return imageAssets
    .filter((asset) => {
      if (filter === 'all') return true
      if (filter === 'unreferenced') return !asset.referenced
      return asset.category === filter
    })
    .filter((asset) => {
      if (!normalized) return true
      return `${asset.path} ${asset.tags.join(' ')}`.toLowerCase().includes(normalized)
    })
    .map<AssetRow>((asset) => ({
      id: asset.id,
      title: asset.file?.name ?? asset.path,
      meta: `${asset.file ? formatBytes(asset.file.size) : '未发现文件'} · ${asset.category}${
        asset.referenced ? '' : ' · 未引用'
      }`,
      tags: asset.tags.join(' '),
      kind: 'images',
      path: asset.path,
      file: asset.file,
      category: asset.category,
      asset,
      referenced: asset.referenced,
    }))
}

export function getAudioAssetRows(
  snapshot: WorkspaceSnapshot,
  filter: AssetFilterCategory,
  query: string,
): AssetRow[] {
  const normalized = query.trim().toLowerCase()
  const audioAssets = snapshot.index.assets.filter(
    (asset) => asset.file?.kind === 'audio' || /\.(ogg|mp3|wav|flac|m4a)$/i.test(asset.path),
  )

  return audioAssets
    .filter((asset) => {
      if (filter === 'all') return true
      if (filter === 'unreferenced') return !asset.referenced
      return asset.category === filter
    })
    .filter((asset) => {
      if (!normalized) return true
      return `${asset.path} ${asset.tags.join(' ')}`.toLowerCase().includes(normalized)
    })
    .map<AssetRow>((asset) => ({
      id: asset.id,
      title: asset.file?.name ?? asset.path,
      meta: `${asset.file ? formatBytes(asset.file.size) : '未发现文件'} · ${asset.category}${
        asset.referenced ? '' : ' · 未引用'
      }`,
      tags: asset.tags.join(' '),
      kind: 'audio',
      path: asset.path,
      file: asset.file,
      category: asset.category,
      asset,
      referenced: asset.referenced,
    }))
}

export function getCharacterAssetRows(
  snapshot: WorkspaceSnapshot,
  query: string,
): AssetRow[] {
  const normalized = query.trim().toLowerCase()
  return snapshot.index.characters
    .filter((character) => {
      if (!normalized) return true
      return (
        character.id.toLowerCase().includes(normalized) ||
        character.displayName.toLowerCase().includes(normalized)
      )
    })
    .map<AssetRow>((character) => ({
      id: `character:${character.id}`,
      title: character.displayName,
      meta: `id ${character.id} · ${character.states.length} 个立绘状态`,
      tags: character.note ?? '',
      kind: 'characters',
      character,
    }))
}

export function getChapterAssetRows(
  snapshot: WorkspaceSnapshot,
  query: string,
): AssetRow[] {
  const normalized = query.trim().toLowerCase()
  return snapshot.index.chapters
    .filter((chapter) => {
      if (!normalized) return true
      return (
        chapter.title.toLowerCase().includes(normalized) ||
        chapter.entryLabel.toLowerCase().includes(normalized) ||
        chapter.filePath.toLowerCase().includes(normalized)
      )
    })
    .map<AssetRow>((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      meta: chapter.entryLabel,
      tags: `${chapter.filePath}:${chapter.lineNumber}`,
      kind: 'chapters',
      path: chapter.entryLabel,
      chapter,
    }))
}

export function buildJourney(snapshot: WorkspaceSnapshot | undefined): JourneyStep[] {
  const hasWorkspace = Boolean(snapshot)
  const hasRpy = countKind(snapshot, 'rpy') > 0
  const hasEditable = (snapshot?.index.lines.filter((line) => line.editable).length ?? 0) > 0
  const hasSprites = snapshot?.index.characters.some((character) => character.states.length > 0) ?? false
  const hasAssets = (snapshot?.index.assets.length ?? 0) > 0

  return [
    {
      id: 'open',
      title: '打开项目',
      meta: hasWorkspace ? snapshot?.name ?? '已打开' : '选择 RenPy 根目录',
      state: hasWorkspace ? 'done' : 'active',
      target: 'home',
    },
    {
      id: 'index',
      title: '建立索引',
      meta: hasRpy ? `${countKind(snapshot, 'rpy')} 个脚本文件` : '等待 .rpy 文件',
      state: !hasWorkspace ? 'waiting' : hasRpy ? 'done' : 'active',
      target: 'visual',
    },
    {
      id: 'write',
      title: '逐行编辑',
      meta: hasEditable ? `${snapshot?.index.lines.filter((line) => line.editable).length} 行可写` : '等待对白或旁白',
      state: !hasRpy ? 'waiting' : hasEditable ? 'active' : 'waiting',
      target: 'visual',
    },
    {
      id: 'sprite',
      title: '立绘插入',
      meta: hasSprites ? '可插入 image tag' : '等待 image 定义',
      state: !hasEditable ? 'waiting' : hasSprites ? 'active' : 'waiting',
      target: 'visual',
    },
    {
      id: 'assets',
      title: '资源整理',
      meta: hasAssets ? `${snapshot?.index.assets.length} 个候选` : '等待图片或音频',
      state: !hasWorkspace ? 'waiting' : hasAssets ? 'active' : 'waiting',
      target: 'assets',
    },
    {
      id: 'review',
      title: '文本复核',
      meta: hasEditable ? '按章节检查文本' : '等待可编辑行',
      state: hasEditable ? 'active' : 'waiting',
      target: 'review',
    },
  ]
}

export function buildHealthItems(snapshot: WorkspaceSnapshot | undefined) {
  if (!snapshot) {
    return [
      { label: '工作区', value: '未打开', level: 'warning' as const },
      { label: '脚本索引', value: '等待授权', level: 'muted' as const },
      { label: '资源缓存', value: '待生成', level: 'muted' as const },
    ]
  }

  const errorCount = snapshot.index.diagnostics.filter((d) => d.severity === 'error').length
  const warnCount = snapshot.index.diagnostics.filter((d) => d.severity === 'warning').length
  const unreferenced = snapshot.index.assets.filter((a) => !a.referenced).length

  return [
    {
      label: '脚本索引',
      value: `${countKind(snapshot, 'rpy')} 个 .rpy`,
      level: countKind(snapshot, 'rpy') > 0 ? ('ok' as const) : ('warning' as const),
    },
    {
      label: '章节入口',
      value: `${snapshot.index.chapters.length} 个 label`,
      level: snapshot.index.chapters.length > 0 ? ('ok' as const) : ('warning' as const),
    },
    {
      label: '未引用资源',
      value: `${unreferenced} 个`,
      level: unreferenced === 0 ? ('ok' as const) : ('muted' as const),
    },
    {
      label: '诊断',
      value: errorCount ? `${errorCount} 错误 · ${warnCount} 警告` : warnCount ? `${warnCount} 警告` : '无阻塞项',
      level: errorCount || warnCount ? ('warning' as const) : ('ok' as const),
    },
  ]
}

export function diagnosticGroup(diagnostics: Diagnostic[]) {
  return {
    errors: diagnostics.filter((item) => item.severity === 'error'),
    warnings: diagnostics.filter((item) => item.severity === 'warning'),
    info: diagnostics.filter((item) => item.severity === 'info'),
  }
}

export const categoryLabel: Record<AssetCategory, string> = {
  character: '角色立绘',
  cg: 'CG',
  bg: '背景',
  fx: '特效',
  bgm: 'BGM',
  sfx: '音效',
  voice: '语音',
  ui: 'UI',
}

export { cn }
