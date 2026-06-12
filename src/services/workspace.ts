import type { FileEntry, FileKind, WorkspaceSnapshot } from '../types'
import { buildRpyIndex } from './rpyParser'
import { idbDelete, idbGet, idbSet } from './storage'

const WORKSPACE_KEY = 'current'
const DEFAULT_IGNORES = new Set([
  '.git',
  '.renpy',
  'cache',
  'saves',
  'node_modules',
  '__pycache__',
  'dist',
  'build',
  'tmp',
])

export async function openWorkspace() {
  if (!window.showDirectoryPicker) {
    throw new Error('当前浏览器不支持 File System Access API，请使用 Chrome 或 Edge。')
  }

  const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  await idbSet('workspace', WORKSPACE_KEY, handle)
  return scanWorkspace(handle)
}

export async function restoreWorkspace() {
  const handle = await idbGet<FileSystemDirectoryHandle>(
    'workspace',
    WORKSPACE_KEY,
  )
  if (!handle) return undefined

  const permission = await verifyPermission(handle)
  if (!permission) return undefined

  return scanWorkspace(handle)
}

export async function forgetWorkspace() {
  await idbDelete('workspace', WORKSPACE_KEY)
}

export async function scanWorkspace(
  rootHandle: FileSystemDirectoryHandle,
): Promise<WorkspaceSnapshot> {
  const gitignore = await readGitignore(rootHandle)
  const files: FileEntry[] = []
  await walkDirectory(rootHandle, '', gitignore, files)
  files.sort((a, b) => a.path.localeCompare(b.path))

  const index = await buildRpyIndex(files)
  return {
    name: rootHandle.name,
    openedAt: Date.now(),
    files,
    index,
  }
}

/**
 * 增量重扫：只重新索引指定文件列表
 * 用于保存文件后仅更新影响的文件而不全盘重扫
 */
export async function rescanFiles(
  snapshot: WorkspaceSnapshot,
  filePaths: string[],
): Promise<WorkspaceSnapshot> {
  const pathSet = new Set(filePaths)
  const refreshed: FileEntry[] = []

  // 重新读取文件元数据
  for (const file of snapshot.files) {
    if (pathSet.has(file.path)) {
      try {
        const blob = await file.handle.getFile()
        refreshed.push({
          ...file,
          size: blob.size,
          lastModified: blob.lastModified,
        })
      } catch {
        // 文件删除或权限丢失，保留原条目
        refreshed.push(file)
      }
    } else {
      refreshed.push(file)
    }
  }

  const index = await buildRpyIndex(refreshed)
  return {
    ...snapshot,
    files: refreshed,
    index,
  }
}

export async function readTextFile(file: FileEntry) {
  const blob = await file.handle.getFile()
  return blob.text()
}

export async function writeTextFile(file: FileEntry, content: string) {
  const writable = await file.handle.createWritable()
  await writable.write(content)
  await writable.close()
}

export async function readBlob(file: FileEntry) {
  return file.handle.getFile()
}

async function verifyPermission(handle: FileSystemDirectoryHandle) {
  const descriptor = { mode: 'readwrite' as const }
  if ((await handle.queryPermission(descriptor)) === 'granted') return true
  return (await handle.requestPermission(descriptor)) === 'granted'
}

async function walkDirectory(
  directory: FileSystemDirectoryHandle,
  prefix: string,
  gitignore: GitIgnoreRule[],
  files: FileEntry[],
) {
  for await (const [name, handle] of directory.entries()) {
    const path = prefix ? `${prefix}/${name}` : name
    if (shouldIgnore(path, name, gitignore)) continue

    if (handle.kind === 'directory') {
      await walkDirectory(
        handle as FileSystemDirectoryHandle,
        path,
        gitignore,
        files,
      )
      continue
    }

    const fileHandle = handle as FileSystemFileHandle
    try {
      const file = await fileHandle.getFile()
      files.push({
        path,
        name,
        kind: kindFromName(name),
        extension: extensionFromName(name),
        size: file.size,
        lastModified: file.lastModified,
        handle: fileHandle,
      })
    } catch {
      // 权限问题或文件被删除，跳过
    }
  }
}

interface GitIgnoreRule {
  pattern: string
  negated: boolean
  directoryOnly: boolean
  regex: RegExp
}

async function readGitignore(rootHandle: FileSystemDirectoryHandle) {
  try {
    const handle = await rootHandle.getFileHandle('.gitignore')
    const text = await handle.getFile().then((file) => file.text())
    return parseGitignore(text)
  } catch {
    return []
  }
}

function parseGitignore(text: string): GitIgnoreRule[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const negated = line.startsWith('!')
      const cleaned = negated ? line.slice(1) : line
      const directoryOnly = cleaned.endsWith('/')
      const pattern = cleaned.replace(/^\/+/, '').replace(/\/+$/, '')

      if (!pattern) return null

      // 构建正则：* 匹配段内任意字符，** 匹配跨段
      let regexPattern = pattern
        .split('/')
        .map((segment) => {
          if (segment === '**') return '.*'
          return segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')
        })
        .join('/')

      // 如果没有 /，则匹配任何层级的该名称
      if (!pattern.includes('/')) {
        regexPattern = `(^|/)${regexPattern}($|/)`
      } else {
        regexPattern = `^${regexPattern}($|/)`
      }

      return {
        pattern,
        negated,
        directoryOnly,
        regex: new RegExp(regexPattern),
      }
    })
    .filter((rule): rule is GitIgnoreRule => rule !== null)
}

function shouldIgnore(path: string, name: string, gitignore: GitIgnoreRule[]) {
  if (DEFAULT_IGNORES.has(name)) return true

  let ignored = false
  for (const rule of gitignore) {
    const pathWithSlash = path + '/'
    if (rule.regex.test(path) || rule.regex.test(pathWithSlash)) {
      ignored = !rule.negated
    }
  }

  return ignored
}

function kindFromName(name: string): FileKind {
  const extension = extensionFromName(name)
  if (extension === 'rpy') return 'rpy'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'].includes(extension)) {
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

function extensionFromName(name: string) {
  const index = name.lastIndexOf('.')
  return index > -1 ? name.slice(index + 1).toLowerCase() : ''
}
