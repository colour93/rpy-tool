import type { DraftEntry, FileEntry, RpyLine, WorkspaceSnapshot } from '@/types'
import {
  buildRpyIndex,
  replaceEditableLine,
  replaceLineSpeaker,
} from './rpy-parser'
import type {
  RenpyFileAdapter,
  RenpyFileEdit,
  RenpyMutationResult,
} from './file-adapter'
import { filePathOf } from './file-adapter'
import {
  makeInsertedLine,
  makeShowCommand,
  replaceDialogueLineSprite,
  replaceEditableLineContent,
  type SaveEditableLineInput,
  type ShowCommandInput,
} from './line-edit'

export interface UndoFileEditResult {
  status: 'applied' | 'conflict'
  snapshot?: WorkspaceSnapshot
}

export class RenpyProjectSdk {
  readonly adapter: RenpyFileAdapter

  constructor(adapter: RenpyFileAdapter) {
    this.adapter = adapter
  }

  async scan(): Promise<WorkspaceSnapshot> {
    const files = await this.adapter.listFiles()
    const index = await buildRpyIndex(files, (file) =>
      this.adapter.readText(file.path),
    )
    return {
      name: this.adapter.name,
      openedAt: Date.now(),
      files,
      index,
    }
  }

  async rescanFiles(
    snapshot: WorkspaceSnapshot,
    filePaths: string[],
  ): Promise<WorkspaceSnapshot> {
    const pathSet = new Set(filePaths)
    const refreshed: FileEntry[] = []

    for (const file of snapshot.files) {
      if (!pathSet.has(file.path)) {
        refreshed.push(file)
        continue
      }

      const stat = await this.adapter.stat(file.path)
      refreshed.push(
        stat
          ? {
              ...file,
              size: stat.size,
              lastModified: stat.lastModified,
            }
          : file,
      )
    }

    const index = await buildRpyIndex(refreshed, (file) =>
      this.adapter.readText(file.path),
    )
    return {
      ...snapshot,
      files: refreshed,
      index,
    }
  }

  async readTextFile(fileOrPath: FileEntry | string) {
    return this.adapter.readText(filePathOf(fileOrPath))
  }

  async writeTextFile(fileOrPath: FileEntry | string, content: string) {
    await this.adapter.writeText(filePathOf(fileOrPath), content)
  }

  async readBlob(fileOrPath: FileEntry | string) {
    if (!this.adapter.readBlob) {
      throw new Error('当前文件适配器不支持二进制读取')
    }
    return this.adapter.readBlob(filePathOf(fileOrPath))
  }

  async statFile(fileOrPath: FileEntry | string) {
    return this.adapter.stat(filePathOf(fileOrPath))
  }

  async persistLines(
    snapshot: WorkspaceSnapshot,
    filePath: string,
    mutate: (lines: string[]) => string[],
  ): Promise<RenpyFileEdit> {
    if (!snapshot.files.some((entry) => entry.path === filePath)) {
      throw new Error(`文件 ${filePath} 不在当前工作区索引中`)
    }
    const text = await this.adapter.readText(filePath)
    const lines = text.split(/\r?\n/)
    const nextText = mutate(lines).join('\n')
    await this.adapter.writeText(filePath, nextText)
    return {
      filePath,
      beforeText: text,
      afterText: nextText,
    }
  }

  async mutateFile(
    snapshot: WorkspaceSnapshot,
    filePath: string,
    mutate: (lines: string[]) => string[],
    selectLineNumber?: number,
  ): Promise<RenpyMutationResult> {
    const edit = await this.persistLines(snapshot, filePath, mutate)
    edit.selectLineNumber = selectLineNumber
    return {
      edit,
      snapshot: await this.rescanFiles(snapshot, [filePath]),
    }
  }

  async undoFileEdit(
    snapshot: WorkspaceSnapshot,
    edit: RenpyFileEdit,
  ): Promise<UndoFileEditResult> {
    const currentText = await this.adapter.readText(edit.filePath)
    if (currentText !== edit.afterText) return { status: 'conflict' }
    await this.adapter.writeText(edit.filePath, edit.beforeText)
    return {
      status: 'applied',
      snapshot: await this.rescanFiles(snapshot, [edit.filePath]),
    }
  }

  async saveEditableLine(
    snapshot: WorkspaceSnapshot,
    line: RpyLine,
    input: SaveEditableLineInput,
  ) {
    return this.mutateFile(
      snapshot,
      line.filePath,
      (lines) =>
        replaceAt(
          lines,
          line.lineNumber,
          replaceEditableLineContent(line.raw, input),
        ),
      line.lineNumber,
    )
  }

  async saveDrafts(
    snapshot: WorkspaceSnapshot,
    drafts: DraftEntry[],
  ): Promise<{ snapshot: WorkspaceSnapshot; touchedFiles: string[] }> {
    const byFile = new Map<string, DraftEntry[]>()
    for (const draft of drafts) {
      const [path] = draft.lineKey.split(':')
      if (!path) continue
      const list = byFile.get(path) ?? []
      list.push(draft)
      byFile.set(path, list)
    }

    const touchedFiles: string[] = []
    for (const [path, list] of byFile) {
      await this.persistLines(snapshot, path, (lines) => {
        const next = [...lines]
        for (const draft of list) {
          const [, lineStr] = draft.lineKey.split(':')
          const lineNumber = Number(lineStr)
          const original = next[lineNumber - 1]
          if (typeof original !== 'string') continue
          const textChanged = replaceEditableLine(original, draft.text)
          next[lineNumber - 1] =
            'speakerId' in draft
              ? replaceLineSpeaker(textChanged, draft.speakerId ?? null)
              : textChanged
        }
        return next
      })
      touchedFiles.push(path)
    }

    return {
      touchedFiles,
      snapshot: await this.rescanFiles(snapshot, touchedFiles),
    }
  }

  async insertEditableLine(
    snapshot: WorkspaceSnapshot,
    line: RpyLine,
    position: 'before' | 'after',
  ): Promise<RenpyMutationResult & { inserted: string }> {
    const inserted = makeInsertedLine(line)
    const targetLineNumber =
      position === 'before' ? line.lineNumber : line.lineNumber + 1
    const result = await this.mutateFile(
      snapshot,
      line.filePath,
      (lines) => {
        const next = [...lines]
        const insertIndex =
          position === 'before'
            ? Math.max(0, line.lineNumber - 1)
            : Math.min(next.length, line.lineNumber)
        next.splice(insertIndex, 0, inserted)
        return next
      },
      targetLineNumber,
    )
    return { ...result, inserted }
  }

  async deleteLine(snapshot: WorkspaceSnapshot, line: RpyLine) {
    return this.mutateFile(
      snapshot,
      line.filePath,
      (lines) => {
        const next = [...lines]
        next.splice(line.lineNumber - 1, 1)
        return next
      },
      line.lineNumber,
    )
  }

  async insertShowCommand(
    snapshot: WorkspaceSnapshot,
    line: RpyLine,
    input: ShowCommandInput,
  ): Promise<RenpyMutationResult & { command: string }> {
    const command = makeShowCommand(line, input)
    const selectLineNumber =
      line.kind === 'label' ? line.lineNumber + 1 : line.lineNumber
    const result = await this.mutateFile(
      snapshot,
      line.filePath,
      (lines) => {
        const next = [...lines]
        const insertIndex =
          line.kind === 'label'
            ? line.lineNumber
            : Math.max(0, line.lineNumber - 1)
        next.splice(insertIndex, 0, command)
        return next
      },
      selectLineNumber,
    )
    return { ...result, command }
  }

  async applyDialogueSprite(
    snapshot: WorkspaceSnapshot,
    line: RpyLine,
    input: { state: ShowCommandInput['state']; text: string },
  ) {
    const nextRaw = replaceDialogueLineSprite(line.raw, input.state, input.text)
    const result = await this.mutateFile(
      snapshot,
      line.filePath,
      (lines) => replaceAt(lines, line.lineNumber, nextRaw),
      line.lineNumber,
    )
    return { ...result, raw: nextRaw }
  }
}

function replaceAt(lines: string[], lineNumber: number, raw: string) {
  const next = [...lines]
  next[lineNumber - 1] = raw
  return next
}
