import { minimatch } from 'minimatch'
import type { AssetCategory } from '@/types'
import { normalizePathKey } from './path-utils'

export interface AssetPathRule {
  id: string
  pattern: string // glob: "images/characters/**/*.png"
  category: AssetCategory
  priority: number
  enabled: boolean
}

const DEFAULT_RULES: AssetPathRule[] = [
  {
    id: 'default-characters',
    pattern: 'images/characters/**/*',
    category: 'character',
    priority: 100,
    enabled: true,
  },
  {
    id: 'default-cg',
    pattern: 'images/cg/**/*',
    category: 'cg',
    priority: 90,
    enabled: true,
  },
  {
    id: 'default-bg',
    pattern: 'images/bg/**/*',
    category: 'bg',
    priority: 90,
    enabled: true,
  },
  {
    id: 'default-bgm',
    pattern: 'audio/bgm/**/*',
    category: 'bgm',
    priority: 90,
    enabled: true,
  },
  {
    id: 'default-sfx',
    pattern: 'audio/sfx/**/*',
    category: 'sfx',
    priority: 90,
    enabled: true,
  },
  {
    id: 'default-voice',
    pattern: 'audio/voice/**/*',
    category: 'voice',
    priority: 90,
    enabled: true,
  },
]

export function loadAssetRules(): AssetPathRule[] {
  try {
    const raw = localStorage.getItem('rpy-tool:asset-rules')
    if (!raw) return DEFAULT_RULES
    const parsed = JSON.parse(raw) as AssetPathRule[]
    return parsed.length > 0 ? parsed : DEFAULT_RULES
  } catch {
    return DEFAULT_RULES
  }
}

export function saveAssetRules(rules: AssetPathRule[]) {
  try {
    localStorage.setItem('rpy-tool:asset-rules', JSON.stringify(rules))
  } catch {
    // ignore
  }
}

export function matchAssetCategory(
  filePath: string,
  rules: AssetPathRule[],
): AssetCategory | undefined {
  const sorted = rules
    .filter((rule) => rule.enabled)
    .sort((a, b) => b.priority - a.priority)

  for (const rule of sorted) {
    if (assetRuleMatchesPath(filePath, rule.pattern)) {
      return rule.category
    }
  }

  return undefined
}

export function assetRuleMatchesPath(filePath: string, pattern: string) {
  const normalizedPattern = normalizePathKey(pattern.trim())
  if (!normalizedPattern) return false
  try {
    return minimatch(normalizePathKey(filePath), normalizedPattern)
  } catch {
    return false
  }
}

export function categoryFromPathHeuristic(path: string): AssetCategory {
  const normalized = normalizePathKey(path)
  if (normalized.includes('/bgm/') || normalized.includes('music')) return 'bgm'
  if (normalized.includes('/sfx/') || normalized.includes('sound')) return 'sfx'
  if (normalized.includes('/voice/')) return 'voice'
  if (normalized.includes('/character') || normalized.includes('/sprite')) {
    return 'character'
  }
  if (normalized.includes('/bg/') || normalized.includes('background'))
    return 'bg'
  if (normalized.includes('/ui/')) return 'ui'
  if (normalized.includes('/fx/')) return 'fx'
  return normalized.match(/\.(ogg|mp3|wav|flac)$/) ? 'sfx' : 'cg'
}
