import type { FileEntry } from '@/types'
import type { FileStat, RenpyFileAdapter } from './file-adapter'
import { extensionFromName, kindFromName } from './file-kind'

export type MemoryFileContent = string | Blob

interface MemoryFileRecord {
  content: MemoryFileContent
  lastModified: number
}

export class MemoryFileAdapter implements RenpyFileAdapter {
  readonly name: string
  private readonly files = new Map<string, MemoryFileRecord>()

  constructor(files: Record<string, MemoryFileContent>, name = 'memory') {
    this.name = name
    const now = Date.now()
    for (const [path, content] of Object.entries(files)) {
      this.files.set(path, { content, lastModified: now })
    }
  }

  async listFiles(): Promise<FileEntry[]> {
    return Array.from(this.files.entries())
      .map(([path, record]) => fileEntryFromMemory(path, record))
      .sort((a, b) => a.path.localeCompare(b.path))
  }

  async readText(path: string) {
    const record = this.requireFile(path)
    if (typeof record.content === 'string') return record.content
    return record.content.text()
  }

  async writeText(path: string, content: string) {
    this.files.set(path, {
      content,
      lastModified: Date.now(),
    })
  }

  async stat(path: string): Promise<FileStat | undefined> {
    const record = this.files.get(path)
    if (!record) return undefined
    return {
      size: contentSize(record.content),
      lastModified: record.lastModified,
    }
  }

  async readBlob(path: string) {
    const content = this.requireFile(path).content
    return typeof content === 'string' ? new Blob([content]) : content
  }

  private requireFile(path: string) {
    const record = this.files.get(path)
    if (!record) throw new Error(`文件 ${path} 不在当前工作区索引中`)
    return record
  }
}

function fileEntryFromMemory(
  path: string,
  record: MemoryFileRecord,
): FileEntry {
  const name = path.split('/').at(-1) ?? path
  return {
    path,
    name,
    kind: kindFromName(name),
    extension: extensionFromName(name),
    size: contentSize(record.content),
    lastModified: record.lastModified,
  }
}

function contentSize(content: MemoryFileContent) {
  return typeof content === 'string' ? new Blob([content]).size : content.size
}
