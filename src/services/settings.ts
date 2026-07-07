import type {
  AssetOverrides,
  ChapterOverrides,
  CharacterOverrides,
  DraftEntry,
  EditorDensity,
  ReviewMark,
  UserSettings,
} from '../types'

const KEYS = {
  settings: 'rpy-tool:settings',
  drafts: 'rpy-tool:drafts',
  characterOverrides: 'rpy-tool:characters',
  chapterOverrides: 'rpy-tool:chapters',
  assetOverrides: 'rpy-tool:assets',
  reviewMarks: 'rpy-tool:review-marks',
} as const

export const SPRITE_CARD_SCALE_MIN = 70
export const SPRITE_CARD_SCALE_MAX = 150
export const SPRITE_CARD_SCALE_STEP = 5
export const SPRITE_CARD_SCALE_DEFAULT = 100
export const SCRIPT_FONT_SIZE_MIN = 12
export const SCRIPT_FONT_SIZE_MAX = 16
export const SCRIPT_FONT_SIZE_DEFAULT = 14

export function clampScriptFontSize(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return SCRIPT_FONT_SIZE_DEFAULT
  return Math.min(
    SCRIPT_FONT_SIZE_MAX,
    Math.max(SCRIPT_FONT_SIZE_MIN, Math.round(numeric)),
  )
}

export function normalizeEditorDensity(value: unknown): EditorDensity {
  if (value === 'compact' || value === 'default' || value === 'comfortable') {
    return value
  }
  return 'default'
}

export function lineRowHeightForDensity(density: EditorDensity) {
  if (density === 'compact') return 40
  if (density === 'comfortable') return 56
  return 48
}

export function clampSpriteCardScale(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return SPRITE_CARD_SCALE_DEFAULT
  return Math.min(
    SPRITE_CARD_SCALE_MAX,
    Math.max(
      SPRITE_CARD_SCALE_MIN,
      Math.round(numeric / SPRITE_CARD_SCALE_STEP) * SPRITE_CARD_SCALE_STEP,
    ),
  )
}

const defaultSettings: UserSettings = {
  theme: 'light',
  editorDensity: 'default',
  scriptFontSize: SCRIPT_FONT_SIZE_DEFAULT,
  view: 'home',
  assetTab: 'characters',
  spriteDefaultPosition: 'left',
  spriteDefaultTransition: undefined,
  spriteCardScale: SPRITE_CARD_SCALE_DEFAULT,
  rememberOpenFile: true,
  lastOpenedFile: undefined,
  autosaveDrafts: true,
  reviewOperationPanelVisible: true,
  motionEnabled: true,
  tourGuideCompleted: false,
  tourGuideCurrentStepId: undefined,
}

export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(KEYS.settings)
    if (!raw) return defaultSettings
    const parsed = JSON.parse(raw) as Partial<UserSettings>
    return {
      ...defaultSettings,
      ...parsed,
      spriteCardScale: clampSpriteCardScale(parsed.spriteCardScale),
      editorDensity: normalizeEditorDensity(parsed.editorDensity),
      scriptFontSize: clampScriptFontSize(parsed.scriptFontSize),
    }
  } catch {
    return defaultSettings
  }
}

export function saveSettings(settings: UserSettings) {
  try {
    localStorage.setItem(KEYS.settings, JSON.stringify(settings))
  } catch {
    // ignore quota errors
  }
}

export function loadDrafts(): Record<string, DraftEntry> {
  try {
    const raw = localStorage.getItem(KEYS.drafts)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, DraftEntry>
  } catch {
    return {}
  }
}

export function saveDrafts(drafts: Record<string, DraftEntry>) {
  try {
    localStorage.setItem(KEYS.drafts, JSON.stringify(drafts))
  } catch {
    // ignore
  }
}

export function clearDraft(
  drafts: Record<string, DraftEntry>,
  lineKey: string,
) {
  const next = { ...drafts }
  delete next[lineKey]
  return next
}

export function loadReviewMarks(): Record<string, ReviewMark> {
  try {
    const raw = localStorage.getItem(KEYS.reviewMarks)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, ReviewMark>
  } catch {
    return {}
  }
}

export function saveReviewMarks(marks: Record<string, ReviewMark>) {
  try {
    localStorage.setItem(KEYS.reviewMarks, JSON.stringify(marks))
  } catch {
    // ignore
  }
}

export function loadCharacterOverrides(): CharacterOverrides {
  try {
    const raw = localStorage.getItem(KEYS.characterOverrides)
    if (!raw) return { byId: {} }
    return JSON.parse(raw) as CharacterOverrides
  } catch {
    return { byId: {} }
  }
}

export function saveCharacterOverrides(overrides: CharacterOverrides) {
  try {
    localStorage.setItem(KEYS.characterOverrides, JSON.stringify(overrides))
  } catch {
    // ignore
  }
}

export function loadChapterOverrides(): ChapterOverrides {
  try {
    const raw = localStorage.getItem(KEYS.chapterOverrides)
    if (!raw) return { byId: {} }
    return JSON.parse(raw) as ChapterOverrides
  } catch {
    return { byId: {} }
  }
}

export function saveChapterOverrides(overrides: ChapterOverrides) {
  try {
    localStorage.setItem(KEYS.chapterOverrides, JSON.stringify(overrides))
  } catch {
    // ignore
  }
}

export function loadAssetOverrides(): AssetOverrides {
  try {
    const raw = localStorage.getItem(KEYS.assetOverrides)
    if (!raw) return { byId: {} }
    return JSON.parse(raw) as AssetOverrides
  } catch {
    return { byId: {} }
  }
}

export function saveAssetOverrides(overrides: AssetOverrides) {
  try {
    localStorage.setItem(KEYS.assetOverrides, JSON.stringify(overrides))
  } catch {
    // ignore
  }
}
