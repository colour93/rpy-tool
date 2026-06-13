export type FileKind =
  | 'rpy'
  | 'image'
  | 'audio'
  | 'video'
  | 'font'
  | 'text'
  | 'binary'
  | 'unknown'

export type AssetCategory =
  | 'character'
  | 'cg'
  | 'bg'
  | 'fx'
  | 'bgm'
  | 'sfx'
  | 'voice'
  | 'ui'

export interface FileEntry {
  path: string
  name: string
  kind: FileKind
  extension: string
  size: number
  lastModified?: number
  handle: FileSystemFileHandle
}

export type RpyLineKind =
  | 'dialogue'
  | 'narration'
  | 'label'
  | 'jump'
  | 'call'
  | 'show'
  | 'scene'
  | 'play'
  | 'image'
  | 'define'
  | 'voice'
  | 'menu'
  | 'choice'
  | 'python'
  | 'comment'
  | 'blank'
  | 'unknown'

export interface RpyLine {
  filePath: string
  lineNumber: number
  raw: string
  kind: RpyLineKind
  characterId?: string
  text?: string
  target?: string
  /** 句末附加修饰 (例如 `with dissolve`) */
  modifier?: string
  editable: boolean
  /** 行所在缩进，用于插入命令对齐 */
  indent?: string
}

export interface CharacterRegistryItem {
  id: string
  displayName: string
  color?: string
  source?: 'parsed' | 'manual'
  states: CharacterState[]
  /** 用户手动覆盖的字段，便于在重扫时保留 */
  overrides?: Partial<Pick<CharacterRegistryItem, 'displayName' | 'color'>>
  note?: string
}

export interface CharacterState {
  id: string
  characterId: string
  label: string
  expression?: string
  pose?: string
  imageTag: string
  path?: string
  sourceFile?: string
  lineNumber?: number
}

export interface AssetRegistryItem {
  id: string
  category: AssetCategory
  path: string
  tags: string[]
  file?: FileEntry
  /** 是否被脚本引用 */
  referenced?: boolean
  /** 用户手动归类时的 override */
  overrideCategory?: AssetCategory
}

export interface ChapterRegistryItem {
  id: string
  title: string
  entryLabel: string
  order: number
  filePath: string
  lineNumber: number
  note?: string
  /** 章节用户重命名 / 排序 / 备注覆写 */
  override?: Partial<Pick<ChapterRegistryItem, 'title' | 'order' | 'note'>>
}

export interface RpyIndex {
  lines: RpyLine[]
  /** 按文件路径快速查找 */
  linesByFile: Record<string, RpyLine[]>
  characters: CharacterRegistryItem[]
  assets: AssetRegistryItem[]
  chapters: ChapterRegistryItem[]
  labels: RpyLine[]
  diagnostics: Diagnostic[]
  /** 索引完成时间戳 */
  indexedAt: number
}

export type DiagnosticSeverity = 'info' | 'warning' | 'error'

export interface Diagnostic {
  id: string
  severity: DiagnosticSeverity
  message: string
  filePath?: string
  lineNumber?: number
  /** 用户可触发的修复建议 */
  hint?: string
  /** 用于跳转的快捷键 */
  jumpTo?: 'visual' | 'review' | 'assets' | 'sprite'
}

export interface WorkspaceSnapshot {
  name: string
  openedAt: number
  files: FileEntry[]
  index: RpyIndex
}

export type ViewKey =
  | 'home'
  | 'visual'
  | 'review'
  | 'sprite'
  | 'assets'
  | 'about'

export type AssetTab = 'characters' | 'images' | 'audio' | 'chapters'

export type AssetFilterCategory = AssetCategory | 'all' | 'unreferenced'

export interface AssetRow {
  id: string
  title: string
  meta: string
  tags: string
  kind: AssetTab
  path?: string
  file?: FileEntry
  category?: AssetCategory
  character?: CharacterRegistryItem
  state?: CharacterState
  chapter?: ChapterRegistryItem
  asset?: AssetRegistryItem
  referenced?: boolean
}

export type FileMode = 'structured' | 'source'

export type ThemeMode = 'light' | 'dark'

export interface SourceEditorState {
  path?: string
  content: string
  dirty: boolean
  loading: boolean
  lastModified?: number
  size?: number
  message?: string
}

export interface UserSettings {
  theme: ThemeMode
  view: ViewKey
  assetTab: AssetTab
  spriteDefaultPosition: SpritePosition
  spriteDefaultTransition?: string
  spriteCardScale: number
  rememberOpenFile: boolean
  lastOpenedFile?: string
  autosaveDrafts: boolean
  reviewOperationPanelVisible: boolean
}

export type SpritePosition =
  | 'left'
  | 'center'
  | 'right'
  | 'far_left'
  | 'far_right'

export interface CharacterOverrides {
  /** key: character id */
  byId: Record<
    string,
    NonNullable<CharacterRegistryItem['overrides']> & { note?: string }
  >
}

export interface ChapterOverrides {
  byId: Record<string, NonNullable<ChapterRegistryItem['override']>>
}

export interface AssetOverrides {
  byId: Record<string, { category?: AssetCategory; tags?: string[] }>
}

export interface DraftEntry {
  /** lineKey = filePath:lineNumber */
  lineKey: string
  text: string
  /** null 表示旁白；undefined 表示未修改说话人 */
  speakerId?: string | null
  updatedAt: number
}

export type ReviewStatus =
  | 'unreviewed'
  | 'approved'
  | 'needs-change'
  | 'ignored'

export interface ReviewMark {
  /** lineKey = filePath:lineNumber */
  lineKey: string
  status: ReviewStatus
  note?: string
  updatedAt: number
}

export interface ToastMessage {
  id: string
  level: 'info' | 'success' | 'warning' | 'error'
  title: string
  description?: string
  action?: { label: string; onTrigger: () => void }
  /** 自动关闭 ms，0 表示不关闭 */
  duration?: number
}

export interface ConfirmDialogOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
}

export interface CommandDefinition {
  id: string
  title: string
  hint?: string
  shortcut?: string
  group?: string
  /** 仅在工作区开启时启用 */
  requiresWorkspace?: boolean
  run: () => void
}
