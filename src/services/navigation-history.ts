import type { AssetTab, FileMode, ReviewQueueScope, ViewKey } from '@/types'

export interface AppNavigationLocation {
  view: ViewKey
  filePath?: string
  lineNumber?: number
  assetTab?: AssetTab
  assetId?: string
  reviewScope?: ReviewQueueScope
  fileMode?: FileMode
}

interface AppHistoryState {
  source: 'rpy-tool'
  kind: 'navigation'
  location: AppNavigationLocation
}

const views: ViewKey[] = [
  'home',
  'visual',
  'review',
  'sprite',
  'assets',
  'about',
]

const assetTabs: AssetTab[] = ['characters', 'images', 'audio', 'chapters']

const reviewScopes: ReviewQueueScope[] = [
  'all',
  'chapter',
  'dirty',
  'diagnostic',
  'noted',
  'unreviewed',
  'approved',
  'needs-change',
  'ignored',
]

const fileModes: FileMode[] = ['structured', 'source']

export function readNavigationHistoryState(
  state: unknown,
): AppNavigationLocation | undefined {
  if (!isRecord(state)) return undefined
  if (state.source !== 'rpy-tool' || state.kind !== 'navigation') {
    return undefined
  }
  return normalizeNavigationLocation(state.location)
}

export function pushNavigationHistory(location: AppNavigationLocation) {
  if (typeof window === 'undefined') return
  window.history.pushState(
    createHistoryState(location),
    '',
    window.location.href,
  )
}

export function replaceNavigationHistory(location: AppNavigationLocation) {
  if (typeof window === 'undefined') return
  window.history.replaceState(
    createHistoryState(location),
    '',
    window.location.href,
  )
}

export function sameNavigationLocation(
  left: AppNavigationLocation,
  right: AppNavigationLocation,
) {
  return (
    left.view === right.view &&
    left.filePath === right.filePath &&
    left.lineNumber === right.lineNumber &&
    left.assetTab === right.assetTab &&
    left.assetId === right.assetId &&
    left.reviewScope === right.reviewScope &&
    left.fileMode === right.fileMode
  )
}

function createHistoryState(location: AppNavigationLocation): AppHistoryState {
  return {
    source: 'rpy-tool',
    kind: 'navigation',
    location,
  }
}

function normalizeNavigationLocation(
  value: unknown,
): AppNavigationLocation | undefined {
  if (!isRecord(value) || !isView(value.view)) return undefined
  const location: AppNavigationLocation = { view: value.view }
  if (typeof value.filePath === 'string' && value.filePath) {
    location.filePath = value.filePath
  }
  if (
    typeof value.lineNumber === 'number' &&
    Number.isInteger(value.lineNumber) &&
    value.lineNumber > 0
  ) {
    location.lineNumber = value.lineNumber
  }
  if (isAssetTab(value.assetTab)) location.assetTab = value.assetTab
  if (typeof value.assetId === 'string' && value.assetId) {
    location.assetId = value.assetId
  }
  if (isReviewScope(value.reviewScope)) {
    location.reviewScope = value.reviewScope
  }
  if (isFileMode(value.fileMode)) location.fileMode = value.fileMode
  return location
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isView(value: unknown): value is ViewKey {
  return views.includes(value as ViewKey)
}

function isAssetTab(value: unknown): value is AssetTab {
  return assetTabs.includes(value as AssetTab)
}

function isReviewScope(value: unknown): value is ReviewQueueScope {
  return reviewScopes.includes(value as ReviewQueueScope)
}

function isFileMode(value: unknown): value is FileMode {
  return fileModes.includes(value as FileMode)
}
