import {
  DEFAULT_ASSET_RULES,
  assetRuleMatchesPath,
  categoryFromPathHeuristic,
  matchAssetCategory,
  type AssetPathRule,
} from '@/sdk/asset-rules'

export type { AssetPathRule }
export { assetRuleMatchesPath, categoryFromPathHeuristic, matchAssetCategory }

export function loadAssetRules(): AssetPathRule[] {
  try {
    const raw = localStorage.getItem('rpy-tool:asset-rules')
    if (!raw) return DEFAULT_ASSET_RULES
    const parsed = JSON.parse(raw) as AssetPathRule[]
    return parsed.length > 0 ? parsed : DEFAULT_ASSET_RULES
  } catch {
    return DEFAULT_ASSET_RULES
  }
}

export function saveAssetRules(rules: AssetPathRule[]) {
  try {
    localStorage.setItem('rpy-tool:asset-rules', JSON.stringify(rules))
  } catch {
    // ignore
  }
}
