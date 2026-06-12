export function normalizeSlashes(path: string) {
  return path.replaceAll('\\', '/').replace(/^\/+/, '').replace(/^(\.\/)+/, '')
}

export function normalizeRuntimePath(path: string) {
  return normalizeSlashes(path).replace(/^game\//i, '')
}

export function normalizePathKey(path: string) {
  return normalizeRuntimePath(path).toLowerCase()
}
