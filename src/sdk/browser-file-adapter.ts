import type { FileEntry } from '@/types'
import type { FileStat, RenpyFileAdapter } from './file-adapter'
import { extensionFromName, kindFromName } from './file-kind'

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

interface GitIgnoreRule {
  pattern: string
  negated: boolean
  directoryOnly: boolean
  regex: RegExp
}

export class BrowserFileSystemAdapter implements RenpyFileAdapter {
  readonly name: string
  readonly rootHandle: FileSystemDirectoryHandle
  private readonly fileHandles = new Map<string, FileSystemFileHandle>()

  constructor(rootHandle: FileSystemDirectoryHandle) {
    this.rootHandle = rootHandle
    this.name = rootHandle.name
  }

  async listFiles(): Promise<FileEntry[]> {
    const gitignore = await readGitignore(this.rootHandle)
    const files: FileEntry[] = []
    this.fileHandles.clear()
    await walkDirectory(this.rootHandle, '', gitignore, files, this.fileHandles)
    files.sort((a, b) => a.path.localeCompare(b.path))
    return files
  }

  async readText(path: string) {
    const blob = await this.getFile(path)
    return blob.text()
  }

  async writeText(path: string, content: string) {
    const handle = this.getFileHandle(path)
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
  }

  async stat(path: string): Promise<FileStat | undefined> {
    try {
      const blob = await this.getFile(path)
      return {
        size: blob.size,
        lastModified: blob.lastModified,
      }
    } catch {
      return undefined
    }
  }

  async readBlob(path: string) {
    return this.getFile(path)
  }

  private async getFile(path: string) {
    return this.getFileHandle(path).getFile()
  }

  private getFileHandle(path: string) {
    const handle = this.fileHandles.get(path)
    if (!handle) throw new Error(`文件 ${path} 不在当前工作区索引中`)
    return handle
  }
}

async function walkDirectory(
  directory: FileSystemDirectoryHandle,
  prefix: string,
  gitignore: GitIgnoreRule[],
  files: FileEntry[],
  handles: Map<string, FileSystemFileHandle>,
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
        handles,
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
      })
      handles.set(path, fileHandle)
    } catch {
      // 权限问题或文件被删除，跳过
    }
  }
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

      let regexPattern = pattern
        .split('/')
        .map((segment) => {
          if (segment === '**') return '.*'
          return segment
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '[^/]*')
        })
        .join('/')

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
