import type { FileKind } from '@/types'

export function kindFromName(name: string): FileKind {
  const extension = extensionFromName(name)
  if (extension === 'rpy') return 'rpy'
  if (
    ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(extension)
  ) {
    return 'image'
  }
  if (['ogg', 'mp3', 'wav', 'flac', 'm4a'].includes(extension)) return 'audio'
  if (['webm', 'mp4', 'mov'].includes(extension)) return 'video'
  if (['ttf', 'otf', 'woff', 'woff2'].includes(extension)) return 'font'
  if (['txt', 'md', 'json', 'yml', 'yaml', 'rpyc', 'rpym'].includes(extension)) {
    return 'text'
  }
  return extension ? 'binary' : 'unknown'
}

export function extensionFromName(name: string) {
  const index = name.lastIndexOf('.')
  return index > -1 ? name.slice(index + 1).toLowerCase() : ''
}
