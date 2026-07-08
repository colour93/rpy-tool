import type { FileEntry, WorkspaceSnapshot } from '@/types'

export interface FileStat {
  size: number
  lastModified?: number
}

export interface RenpyFileAdapter {
  name: string
  listFiles(): Promise<FileEntry[]>
  readText(path: string): Promise<string>
  writeText(path: string, content: string): Promise<void>
  stat(path: string): Promise<FileStat | undefined>
  readBlob?(path: string): Promise<Blob>
}

export interface RenpyFileEdit {
  filePath: string
  beforeText: string
  afterText: string
  selectLineNumber?: number
}

export interface RenpyMutationResult {
  edit: RenpyFileEdit
  snapshot: WorkspaceSnapshot
}

export function filePathOf(fileOrPath: FileEntry | string) {
  return typeof fileOrPath === 'string' ? fileOrPath : fileOrPath.path
}
