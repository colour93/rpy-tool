import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AssetTab,
  CharacterRegistryItem,
  CharacterState,
  ChapterRegistryItem,
  CommandDefinition,
  Diagnostic,
  DraftEntry,
  FileMode,
  ReviewMark,
  ReviewStatus,
  RpyLine,
  SourceEditorState,
  SpritePosition,
  ThemeMode,
  UserSettings,
  ViewKey,
  WorkspaceSnapshot,
} from '@/types'
import {
  buildShowCommand,
  replaceLineSpeaker,
  replaceDialogueSprite,
  replaceEditableLine,
} from '@/services/rpyParser'
import {
  forgetWorkspace,
  openWorkspace,
  readTextFile,
  rescanFiles,
  restoreWorkspace,
  writeTextFile,
} from '@/services/workspace'
import {
  clearDraft,
  loadCharacterOverrides,
  loadChapterOverrides,
  loadDrafts,
  loadReviewMarks,
  loadSettings,
  clampSpriteCardScale,
  saveCharacterOverrides,
  saveChapterOverrides,
  saveDrafts,
  saveReviewMarks,
  saveSettings,
} from '@/services/settings'
import {
  loadAssetRules,
  saveAssetRules,
  type AssetPathRule,
} from '@/services/asset-rules'
import {
  chapterForLine,
  firstEditableLine,
  isSourceEditable,
  lineKey,
  reclassifyAssets,
} from '@/appHelpers'
import { ToastProvider, useToast } from '@/hooks/useToast'
import { DialogProvider, useDialog } from '@/hooks/useDialog'
import {
  CommandPaletteProvider,
  useCommandPalette,
  useRegisterCommands,
} from '@/hooks/useCommandPalette'
import { useHotkeys } from '@/hooks/useHotkeys'
import { useUnsavedGuard } from '@/hooks/useUnsavedGuard'
import { Topbar } from '@/components/layout/topbar'
import { StatusRail } from '@/components/layout/status-rail'
import { HomeView } from '@/components/views/home-view'
import { VisualView } from '@/components/views/visual-view'
import { ReviewView } from '@/components/views/review-view'
import { SpriteView } from '@/components/views/sprite-view'
import { AssetsView } from '@/components/views/assets-view'
import { AboutView } from '@/components/views/about-view'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isReviewStatus(value: unknown): value is ReviewStatus {
  return (
    value === 'unreviewed' ||
    value === 'approved' ||
    value === 'needs-change' ||
    value === 'ignored'
  )
}

function normalizeReviewMarks(value: unknown): Record<string, ReviewMark> | undefined {
  if (!isRecord(value)) return undefined
  const marks: Record<string, ReviewMark> = {}
  const now = Date.now()
  for (const [key, markValue] of Object.entries(value)) {
    if (!isRecord(markValue)) return undefined
    const importedLineKey =
      typeof markValue.lineKey === 'string' && markValue.lineKey
        ? markValue.lineKey
        : key
    if (!importedLineKey || !isReviewStatus(markValue.status)) return undefined
    if (markValue.note !== undefined && typeof markValue.note !== 'string') {
      return undefined
    }
    const note = markValue.note
    if (markValue.status === 'unreviewed' && !note?.trim()) continue
    const updatedAt =
      typeof markValue.updatedAt === 'number' && Number.isFinite(markValue.updatedAt)
        ? markValue.updatedAt
        : now
    marks[importedLineKey] = {
      lineKey: importedLineKey,
      status: markValue.status,
      updatedAt,
      ...(note ? { note } : {}),
    }
  }
  return marks
}

function safeFileSegment(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'workspace'
}

function AppShell({
  onWorkspaceReadyChange,
}: {
  onWorkspaceReadyChange: (ready: boolean) => void
}) {
  const toast = useToast()
  const dialog = useDialog()
  const palette = useCommandPalette()

  const [settings, setSettings] = useState<UserSettings>(() => loadSettings())
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | undefined>()
  const [status, setStatus] = useState('准备打开 RenPy 工作区')
  const [isBusy, setIsBusy] = useState(false)
  const [isRestoring, setIsRestoring] = useState(true)
  const [query, setQuery] = useState('')
  const [selectedFilePath, setSelectedFilePath] = useState<string | undefined>(
    settings.lastOpenedFile,
  )
  const [selectedLineKey, setSelectedLineKey] = useState<string | undefined>()
  const [selectedStateId, setSelectedStateId] = useState<string | undefined>()
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>()
  const [spritePosition] = useState<SpritePosition>(
    settings.spriteDefaultPosition,
  )
  const [spriteTransition] = useState<string>(
    settings.spriteDefaultTransition ?? '',
  )
  const [fileMode, setFileMode] = useState<FileMode>('structured')
  const [sourceEditor, setSourceEditor] = useState<SourceEditorState>({
    content: '',
    dirty: false,
    loading: false,
  })
  const [drafts, setDrafts] = useState<Record<string, DraftEntry>>(() => loadDrafts())
  const [reviewMarks, setReviewMarks] = useState(() => loadReviewMarks())
  const [characterOverrides, setCharacterOverrides] = useState(() =>
    loadCharacterOverrides(),
  )
  const [chapterOverrides, setChapterOverrides] = useState(() =>
    loadChapterOverrides(),
  )
  const [assetRules, setAssetRules] = useState<AssetPathRule[]>(() => loadAssetRules())

  const view = settings.view
  const assetTab = settings.assetTab
  const setView = useCallback((next: ViewKey) => {
    setSettings((current) => ({ ...current, view: next }))
  }, [])
  const setAssetTab = useCallback((tab: AssetTab) => {
    setSettings((current) => ({ ...current, assetTab: tab }))
  }, [])
  const setTheme = useCallback((theme: ThemeMode) => {
    setSettings((current) => ({ ...current, theme }))
  }, [])
  const toggleTheme = useCallback(() => {
    setSettings((current) => ({
      ...current,
      theme: current.theme === 'dark' ? 'light' : 'dark',
    }))
  }, [])
  const toggleReviewOperationPanel = useCallback(() => {
    setSettings((current) => ({
      ...current,
      reviewOperationPanelVisible: !current.reviewOperationPanelVisible,
    }))
  }, [])
  const setSpriteCardScale = useCallback((spriteCardScale: number) => {
    setSettings((current) => ({
      ...current,
      spriteCardScale: clampSpriteCardScale(spriteCardScale),
    }))
  }, [])

  // Persist
  useEffect(() => { saveSettings(settings) }, [settings])
  useEffect(() => { saveDrafts(drafts) }, [drafts])
  useEffect(() => { saveReviewMarks(reviewMarks) }, [reviewMarks])
  useEffect(() => { saveCharacterOverrides(characterOverrides) }, [characterOverrides])
  useEffect(() => { saveChapterOverrides(chapterOverrides) }, [chapterOverrides])
  useEffect(() => { saveAssetRules(assetRules) }, [assetRules])
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    document.documentElement.classList.toggle('dark', settings.theme === 'dark')
  }, [settings.theme])
  useEffect(() => {
    onWorkspaceReadyChange(Boolean(snapshot))
  }, [onWorkspaceReadyChange, snapshot])

  // Restore
  useEffect(() => {
    let cancelled = false
    setIsBusy(true)
    restoreWorkspace()
      .then((restored) => {
        if (!restored || cancelled) return
        const reclassified = {
          ...restored,
          index: reclassifyAssets(restored.index, assetRules),
        }
        applyOverrides(reclassified, characterOverrides, chapterOverrides)
        const path =
          (settings.rememberOpenFile && settings.lastOpenedFile) ||
          reclassified.files.find((file) => file.kind === 'rpy')?.path
        const line = firstEditableLine(reclassified, path)
        const firstState = reclassified.index.characters.flatMap(
          (c) => c.states,
        )[0]
        setSnapshot(reclassified)
        setSelectedFilePath(path)
        setSelectedLineKey(line ? lineKey(line) : undefined)
        setSelectedStateId(firstState?.id)
        setStatus(`已恢复工作区 ${reclassified.name}`)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '恢复工作区失败'
        setStatus(message)
        toast.error('恢复工作区失败', message)
      })
      .finally(() => {
        if (!cancelled) {
          setIsBusy(false)
          setIsRestoring(false)
        }
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-apply overrides + rules when changed
  useEffect(() => {
    if (snapshot) {
      const reclassified = {
        ...snapshot,
        index: reclassifyAssets(snapshot.index, assetRules),
      }
      applyOverrides(reclassified, characterOverrides, chapterOverrides)
      setSnapshot(reclassified)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterOverrides, chapterOverrides, assetRules])

  // Persist last opened file
  useEffect(() => {
    if (settings.rememberOpenFile && selectedFilePath !== settings.lastOpenedFile) {
      setSettings((current) => ({ ...current, lastOpenedFile: selectedFilePath }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFilePath])

  const selectedFile = useMemo(
    () =>
      snapshot?.files.find((file) => file.path === selectedFilePath) ??
      snapshot?.files.find((file) => file.kind === 'rpy'),
    [selectedFilePath, snapshot],
  )

  const fileRows = useMemo(() => {
    const files = snapshot?.files ?? []
    const normalized = query.trim().toLowerCase()
    const rpyFiles = files.filter((file) => file.kind === 'rpy')
    if (!normalized) return rpyFiles
    return rpyFiles.filter((file) => {
      const fileLines = snapshot?.index.linesByFile[file.path] ?? []
      return (
        file.path.toLowerCase().includes(normalized) ||
        fileLines.some((line) =>
          `${line.target ?? ''} ${line.text ?? ''} ${line.characterId ?? ''}`
            .toLowerCase()
            .includes(normalized),
        )
      )
    })
  }, [query, snapshot])

  const selectedLine = useMemo(() => {
    if (!snapshot) return undefined
    const found = snapshot.index.lines.find(
      (line) => lineKey(line) === selectedLineKey,
    )
    if (found) return found
    return firstEditableLine(snapshot, selectedFile?.path)
  }, [selectedFile?.path, selectedLineKey, snapshot])

  const selectedChapter = useMemo(() => {
    if (!snapshot || !selectedLine) return snapshot?.index.chapters[0]
    return chapterForLine(snapshot.index.chapters, selectedLine)
  }, [selectedLine, snapshot])

  const selectedState = useMemo(() => {
    const states = snapshot?.index.characters.flatMap((c) => c.states)
    if (!states?.length) return undefined
    return (
      states.find((state) => state.id === selectedStateId) ??
      states.find((state) => state.characterId === selectedLine?.characterId) ??
      states[0]
    )
  }, [selectedLine?.characterId, selectedStateId, snapshot])

  const draftKey = selectedLine ? lineKey(selectedLine) : undefined
  const currentDraft = draftKey ? drafts[draftKey] : undefined
  const currentDraftText =
    selectedLine && currentDraft
      ? currentDraft.text
      : (selectedLine?.text ?? '')
  const currentDraftSpeakerId =
    currentDraft && 'speakerId' in currentDraft
      ? currentDraft.speakerId ?? null
      : selectedLine?.characterId ?? null
  const dirty =
    selectedLine?.editable && draftKey
      ? currentDraft
        ? currentDraft.text !== (selectedLine.text ?? '') ||
          ('speakerId' in currentDraft &&
            (currentDraft.speakerId ?? null) !== (selectedLine.characterId ?? null))
        : false
      : false

  function isLineDirty(line: RpyLine) {
    if (!line.editable) return false
    const draft = drafts[lineKey(line)]
    if (!draft) return false
    return (
      draft.text !== (line.text ?? '') ||
      ('speakerId' in draft && (draft.speakerId ?? null) !== (line.characterId ?? null))
    )
  }

  const dirtyByFile = useMemo(() => {
    const set = new Set<string>()
    for (const key of Object.keys(drafts)) {
      const [path] = key.split(':')
      if (path) set.add(path)
    }
    return set
  }, [drafts])

  const hasUnsaved = Object.keys(drafts).length > 0 || sourceEditor.dirty

  useUnsavedGuard(hasUnsaved)

  function updateSelectedDraft(text: string, speakerId: string | null) {
    if (!selectedLine?.editable || !draftKey) return
    const original = selectedLine.text ?? ''
    const originalSpeakerId = selectedLine.characterId ?? null
    if (text === original && speakerId === originalSpeakerId) {
      setDrafts((current) => clearDraft(current, draftKey))
      return
    }
    setDrafts((current) => ({
      ...current,
      [draftKey]: { lineKey: draftKey, text, speakerId, updatedAt: Date.now() },
    }))
  }

  function setDraftText(text: string) {
    updateSelectedDraft(text, currentDraftSpeakerId)
  }

  function setDraftSpeaker(speakerId: string | null) {
    updateSelectedDraft(currentDraftText, speakerId)
  }

  function applySnapshot(next: WorkspaceSnapshot, keepSelection: boolean) {
    const reclassified = {
      ...next,
      index: reclassifyAssets(next.index, assetRules),
    }
    applyOverrides(reclassified, characterOverrides, chapterOverrides)
    setSnapshot(reclassified)
    const filePath =
      keepSelection && selectedFilePath
        ? selectedFilePath
        : reclassified.files.find((file) => file.kind === 'rpy')?.path
    setSelectedFilePath(filePath)
    const line =
      keepSelection && selectedLineKey
        ? reclassified.index.lines.find((item) => lineKey(item) === selectedLineKey)
        : firstEditableLine(reclassified, filePath)
    setSelectedLineKey(line ? lineKey(line) : undefined)
    setSelectedStateId((current) => {
      const states = reclassified.index.characters.flatMap((c) => c.states)
      return current && states.some((state) => state.id === current)
        ? current
        : states[0]?.id
    })
  }

  async function handleOpenWorkspace() {
    if (hasUnsaved) {
      const confirmed = await dialog.confirm({
        title: '当前有未保存改动',
        description: '打开新工作区会清除当前会话状态。',
        confirmLabel: '继续打开',
        tone: 'danger',
      })
      if (!confirmed) return
    }
    setIsBusy(true)
    setStatus('正在请求工作区权限…')
    try {
      const next = await openWorkspace()
      applySnapshot(next, false)
      setDrafts({})
      setSourceEditor({ content: '', dirty: false, loading: false })
      setStatus(`已索引 ${next.files.length} 个文件，${next.index.lines.length} 行脚本`)
      toast.success('工作区已打开', `共索引 ${next.files.length} 个文件`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '打开工作区失败'
      setStatus(message)
      if (!message.toLowerCase().includes('abort')) toast.error('打开工作区失败', message)
    } finally {
      setIsBusy(false)
    }
  }

  async function handleRescan() {
    if (!snapshot) return
    setIsBusy(true)
    setStatus('正在重新扫描工作区…')
    try {
      const restored = await restoreWorkspace()
      if (restored) {
        applySnapshot(restored, true)
        setStatus(`重新索引完成：${restored.files.length} 个文件`)
        toast.info('重新扫描完成', `${restored.files.length} 个文件已索引`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '重新扫描失败'
      setStatus(message)
      toast.error('重新扫描失败', message)
    } finally {
      setIsBusy(false)
    }
  }

  async function handleForgetWorkspace() {
    if (hasUnsaved) {
      const confirmed = await dialog.confirm({
        title: '丢弃未保存改动？',
        description: '关闭工作区会清空草稿。建议先「提交全部」。',
        confirmLabel: '直接关闭',
        tone: 'danger',
      })
      if (!confirmed) return
    }
    await forgetWorkspace()
    setSnapshot(undefined)
    setSelectedFilePath(undefined)
    setSelectedLineKey(undefined)
    setSelectedAssetId(undefined)
    setSourceEditor({ content: '', dirty: false, loading: false })
    setDrafts({})
    setStatus('已关闭当前工作区')
    toast.info('已关闭工作区')
  }

  function handleSelectFile(path: string, line?: RpyLine) {
    setSelectedFilePath(path)
    const nextLine = line ?? firstEditableLine(snapshot, path)
    setSelectedLineKey(nextLine ? lineKey(nextLine) : undefined)
    const file = snapshot?.files.find((item) => item.path === path)
    if (fileMode === 'source' && file) {
      void handleLoadSource(file)
    }
  }

  async function persistLines(filePath: string, mutate: (lines: string[]) => string[]) {
    if (!snapshot) return
    const file = snapshot.files.find((entry) => entry.path === filePath)
    if (!file) throw new Error(`文件 ${filePath} 不在当前工作区索引中`)
    const text = await readTextFile(file)
    const lines = text.split(/\r?\n/)
    const next = mutate(lines)
    await writeTextFile(file, next.join('\n'))
    return file
  }

  async function handleSaveLine(line = selectedLine) {
    if (!snapshot || !line?.editable) return
    const targetDraftKey = lineKey(line)
    const targetDraft = drafts[targetDraftKey]
    if (!isLineDirty(line)) {
      toast.info('没有需要保存的修改')
      return
    }
    const nextText = targetDraft?.text ?? line.text ?? ''
    const nextSpeakerId =
      targetDraft && 'speakerId' in targetDraft
        ? targetDraft.speakerId ?? null
        : line.characterId ?? null
    setIsBusy(true)
    try {
      await persistLines(line.filePath, (lines) => {
        const next = [...lines]
        const nextRaw = replaceLineSpeaker(replaceEditableLine(
          line.raw,
          nextText,
        ), nextSpeakerId)
        next[line.lineNumber - 1] = nextRaw
        return next
      })
      const refreshed = await rescanFiles(snapshot, [line.filePath])
      applySnapshot(refreshed, true)
      setDrafts((current) => clearDraft(current, targetDraftKey))
      clearReviewMarkForLine(line)
      selectNearestLine(refreshed, line.filePath, line.lineNumber)
      setStatus(`已写回 ${line.filePath}:${line.lineNumber}`)
      toast.success('已保存', `${line.filePath}:${line.lineNumber}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '写回失败'
      setStatus(message)
      toast.error('保存失败', message)
    } finally {
      setIsBusy(false)
    }
  }

  function clearDraftsForFile(filePath: string) {
    setDrafts((current) => {
      const next = { ...current }
      let changed = false
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${filePath}:`)) {
          delete next[key]
          changed = true
        }
      }
      return changed ? next : current
    })
  }

  function clearReviewMarksForFile(filePath: string) {
    setReviewMarks((current) => {
      const next = { ...current }
      let changed = false
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${filePath}:`)) {
          delete next[key]
          changed = true
        }
      }
      return changed ? next : current
    })
  }

  function clearReviewMarkForLine(line: RpyLine) {
    const key = lineKey(line)
    setReviewMarks((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function draftCountForFile(filePath: string) {
    return Object.keys(drafts).filter((key) => key.startsWith(`${filePath}:`)).length
  }

  function selectNearestLine(next: WorkspaceSnapshot, filePath: string, lineNumber: number) {
    const lines = next.index.linesByFile[filePath] ?? []
    const line =
      lines.find((item) => item.lineNumber >= lineNumber) ??
      lines[lines.length - 1] ??
      firstEditableLine(next, filePath)
    setSelectedFilePath(filePath)
    setSelectedLineKey(line ? lineKey(line) : undefined)
  }

  function makeInsertedLine(anchor: RpyLine) {
    const indent = anchor.indent ?? ''
    if (anchor.kind === 'choice') return `${indent}"":`
    if (anchor.characterId) {
      const head = [anchor.characterId, anchor.target].filter(Boolean).join(' ')
      return `${indent}${head} ""`
    }
    return `${indent}""`
  }

  async function confirmLineNumberShift(actionLabel: string, filePath: string) {
    const count = draftCountForFile(filePath)
    if (count === 0) return true
    return dialog.confirm({
      title: `${actionLabel}会清除该文件草稿`,
      description: `${filePath} 有 ${count} 行草稿。由于行号会变化，这些草稿会被清除以避免写回到错误行。`,
      confirmLabel: actionLabel,
      tone: 'danger',
    })
  }

  async function handleInsertLine(position: 'before' | 'after', line = selectedLine) {
    if (!snapshot || !line) return
    const filePath = line.filePath
    if (sourceEditor.dirty && sourceEditor.path === filePath) {
      toast.warn('请先保存源文件草稿', `${filePath} 有未保存的 Monaco 内容`)
      return
    }
    const confirmed = await confirmLineNumberShift(
      position === 'before' ? '上方插入' : '下方插入',
      filePath,
    )
    if (!confirmed) return
    setIsBusy(true)
    try {
      const inserted = makeInsertedLine(line)
      const targetLineNumber =
        position === 'before' ? line.lineNumber : line.lineNumber + 1
      await persistLines(filePath, (lines) => {
        const next = [...lines]
        const insertIndex =
          position === 'before'
            ? Math.max(0, line.lineNumber - 1)
            : Math.min(next.length, line.lineNumber)
        next.splice(insertIndex, 0, inserted)
        return next
      })
      const refreshed = await rescanFiles(snapshot, [filePath])
      applySnapshot(refreshed, true)
      clearDraftsForFile(filePath)
      clearReviewMarksForFile(filePath)
      selectNearestLine(refreshed, filePath, targetLineNumber)
      setStatus(`已在 ${filePath}:${targetLineNumber} 插入新行`)
      toast.success('已插入新行', inserted.trim() || '空行')
    } catch (error) {
      const message = error instanceof Error ? error.message : '插入行失败'
      setStatus(message)
      toast.error('插入行失败', message)
    } finally {
      setIsBusy(false)
    }
  }

  async function handleDeleteLine(line = selectedLine) {
    if (!snapshot || !line) return
    const filePath = line.filePath
    if (sourceEditor.dirty && sourceEditor.path === filePath) {
      toast.warn('请先保存源文件草稿', `${filePath} 有未保存的 Monaco 内容`)
      return
    }
    const count = draftCountForFile(filePath)
    const confirmed = await dialog.confirm({
      title: `删除 ${filePath}:${line.lineNumber}？`,
      description: `${line.raw.trim() || '空行'}${
        count > 0
          ? `\n\n该文件 ${count} 行草稿会一并清除，避免行号变化后写错位置。`
          : ''
      }`,
      confirmLabel: '删除行',
      tone: 'danger',
    })
    if (!confirmed) return
    setIsBusy(true)
    try {
      await persistLines(filePath, (lines) => {
        const next = [...lines]
        next.splice(line.lineNumber - 1, 1)
        return next
      })
      const refreshed = await rescanFiles(snapshot, [filePath])
      applySnapshot(refreshed, true)
      clearDraftsForFile(filePath)
      clearReviewMarksForFile(filePath)
      selectNearestLine(refreshed, filePath, line.lineNumber)
      setStatus(`已删除 ${filePath}:${line.lineNumber}`)
      toast.success('已删除行', `${filePath}:${line.lineNumber}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除行失败'
      setStatus(message)
      toast.error('删除行失败', message)
    } finally {
      setIsBusy(false)
    }
  }

  async function handleSaveAllDrafts() {
    if (!snapshot || Object.keys(drafts).length === 0) return
    const confirmed = await dialog.confirm({
      title: `提交 ${Object.keys(drafts).length} 行草稿？`,
      description: '所有草稿会按行号写回到对应文件。',
      confirmLabel: '提交全部',
    })
    if (!confirmed) return
    setIsBusy(true)
    try {
      const byFile = new Map<string, DraftEntry[]>()
      for (const draft of Object.values(drafts)) {
        const [path] = draft.lineKey.split(':')
        const list = byFile.get(path) ?? []
        list.push(draft)
        byFile.set(path, list)
      }
      const touchedFiles: string[] = []
      for (const [path, list] of byFile) {
        await persistLines(path, (lines) => {
          const next = [...lines]
          for (const draft of list) {
            const [, lineStr] = draft.lineKey.split(':')
            const lineNumber = Number(lineStr)
            const original = next[lineNumber - 1]
            if (typeof original === 'string') {
              const textChanged = replaceEditableLine(original, draft.text)
              next[lineNumber - 1] =
                'speakerId' in draft
                  ? replaceLineSpeaker(textChanged, draft.speakerId ?? null)
                  : textChanged
            }
          }
          return next
        })
        touchedFiles.push(path)
      }
      const refreshed = await rescanFiles(snapshot, touchedFiles)
      applySnapshot(refreshed, true)
      setReviewMarks((current) => {
        const next = { ...current }
        let changed = false
        for (const draft of Object.values(drafts)) {
          if (draft.lineKey in next) {
            delete next[draft.lineKey]
            changed = true
          }
        }
        return changed ? next : current
      })
      setDrafts({})
      setStatus(`已提交 ${Object.keys(drafts).length} 行修改`)
      toast.success(
        '提交成功',
        `${Object.keys(drafts).length} 行写回 ${touchedFiles.length} 个文件`,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : '提交失败'
      setStatus(message)
      toast.error('批量提交失败', message)
    } finally {
      setIsBusy(false)
    }
  }

  async function handleInsertAt(
    variant: 'show' | 'scene',
    state: CharacterState | undefined = selectedState,
  ) {
    if (!snapshot || !selectedLine || !state) return
    setIsBusy(true)
    try {
      const command = buildShowCommand({
        imageTag: state.imageTag,
        position: spritePosition,
        transition: spriteTransition || undefined,
        indent: selectedLine.indent ?? '    ',
        variant,
      })
      await persistLines(selectedLine.filePath, (lines) => {
        const next = [...lines]
        const insertIndex =
          selectedLine.kind === 'label'
            ? selectedLine.lineNumber
            : Math.max(0, selectedLine.lineNumber - 1)
        next.splice(insertIndex, 0, command)
        return next
      })
      const refreshed = await rescanFiles(snapshot, [selectedLine.filePath])
      applySnapshot(refreshed, true)
      clearReviewMarksForFile(selectedLine.filePath)
      setStatus(`已插入：${command.trim()}`)
      toast.success(`${variant} 已插入`, command.trim())
    } catch (error) {
      const message = error instanceof Error ? error.message : '插入失败'
      setStatus(message)
      toast.error('插入失败', message)
    } finally {
      setIsBusy(false)
    }
  }

  async function handleApplyDialogueSprite(state: CharacterState) {
    if (!snapshot || !selectedLine || selectedLine.kind !== 'dialogue') return
    setIsBusy(true)
    try {
      const nextRaw = replaceEditableLine(
        replaceDialogueSprite(selectedLine.raw, state),
        currentDraftText,
      )
      await persistLines(selectedLine.filePath, (lines) => {
        const next = [...lines]
        next[selectedLine.lineNumber - 1] = nextRaw
        return next
      })
      const refreshed = await rescanFiles(snapshot, [selectedLine.filePath])
      applySnapshot(refreshed, true)
      if (draftKey) setDrafts((current) => clearDraft(current, draftKey))
      clearReviewMarkForLine(selectedLine)
      setStatus(`已套用立绘：${nextRaw.trim()}`)
      toast.success('立绘已套用到对白', nextRaw.trim())
    } catch (error) {
      const message = error instanceof Error ? error.message : '套用立绘失败'
      toast.error('套用失败', message)
    } finally {
      setIsBusy(false)
    }
  }

  async function handleLoadSource(file = selectedFile) {
    if (!file) {
      toast.warn('请先选择一个文件')
      return
    }
    if (!isSourceEditable(file)) {
      toast.warn(`${file.name} 不支持源文件编辑`, '只支持小于 2MB 的文本文件')
      return
    }
    if (sourceEditor.dirty && sourceEditor.path !== file.path) {
      const confirmed = await dialog.confirm({
        title: '丢弃源文件草稿？',
        description: `${sourceEditor.path} 还有未保存修改。`,
        confirmLabel: '丢弃并加载',
        tone: 'danger',
      })
      if (!confirmed) return
    }
    setFileMode('source')
    setSourceEditor((current) => ({
      ...current,
      path: file.path,
      loading: true,
      message: '读取中…',
    }))
    try {
      const blob = await file.handle.getFile()
      const content = await blob.text()
      setSourceEditor({
        path: file.path,
        content,
        dirty: false,
        loading: false,
        lastModified: blob.lastModified,
        size: blob.size,
        message: `已载入 ${file.path}`,
      })
      setStatus(`已打开源文件 ${file.path}`)
    } catch (error) {
      setSourceEditor((current) => ({ ...current, loading: false }))
      const message = error instanceof Error ? error.message : '读取源文件失败'
      toast.error('读取失败', message)
    }
  }

  async function handleSaveSource() {
    if (!snapshot || !sourceEditor.path || !sourceEditor.dirty) return
    const file = snapshot.files.find((entry) => entry.path === sourceEditor.path)
    if (!file) return
    setIsBusy(true)
    try {
      const latest = await file.handle.getFile()
      const externallyChanged =
        latest.lastModified !== sourceEditor.lastModified ||
        latest.size !== sourceEditor.size
      if (externallyChanged) {
        const confirmed = await dialog.confirm({
          title: '文件已被外部修改',
          description: '是否仍然覆盖保存？',
          confirmLabel: '仍然保存',
          tone: 'danger',
        })
        if (!confirmed) {
          setStatus('已取消覆盖保存')
          return
        }
      }
      await writeTextFile(file, sourceEditor.content)
      const saved = await file.handle.getFile()
      const refreshed = await rescanFiles(snapshot, [file.path])
      applySnapshot(refreshed, true)
      clearReviewMarksForFile(file.path)
      setSourceEditor((current) => ({
        ...current,
        dirty: false,
        lastModified: saved.lastModified,
        size: saved.size,
        message: '保存完成',
      }))
      setStatus(`已保存 ${file.path}`)
      toast.success('源文件已保存', file.path)
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存源文件失败'
      toast.error('保存失败', message)
    } finally {
      setIsBusy(false)
    }
  }

  async function handleCopy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.info('已复制到剪贴板', label)
    } catch {
      toast.error('复制失败', '浏览器可能未授予剪贴板权限')
    }
  }

  function handleJumpToLine(filePath: string, lineNumber: number) {
    if (!snapshot) return
    const line = snapshot.index.lines.find(
      (item) => item.filePath === filePath && item.lineNumber === lineNumber,
    )
    if (!line) {
      toast.warn(`未找到 ${filePath}:${lineNumber}`)
      return
    }
    setSelectedFilePath(filePath)
    setSelectedLineKey(lineKey(line))
    setView('visual')
  }

  function handleJumpDiagnostic(diagnostic: Diagnostic) {
    if (diagnostic.filePath && diagnostic.lineNumber) {
      handleJumpToLine(diagnostic.filePath, diagnostic.lineNumber)
    } else if (diagnostic.jumpTo) {
      setView(diagnostic.jumpTo)
    }
  }

  function handleUpdateCharacter(
    id: string,
    patch: Partial<Pick<CharacterRegistryItem, 'displayName' | 'color' | 'note'>>,
  ) {
    setCharacterOverrides((current) => ({
      byId: { ...current.byId, [id]: { ...current.byId[id], ...patch } },
    }))
  }

  function handleUpdateChapter(
    id: string,
    patch: Partial<Pick<ChapterRegistryItem, 'title' | 'order' | 'note'>>,
  ) {
    setChapterOverrides((current) => ({
      byId: { ...current.byId, [id]: { ...current.byId[id], ...patch } },
    }))
  }

  function handleMarkReview(
    line: RpyLine,
    markStatus: Exclude<ReviewStatus, 'unreviewed'>,
  ) {
    const key = lineKey(line)
    setReviewMarks((current) => {
      const currentMark = current[key]
      return {
        ...current,
        [key]: {
          ...currentMark,
          lineKey: key,
          status: markStatus,
          updatedAt: Date.now(),
        },
      }
    })
  }

  function handleUpdateReviewNote(line: RpyLine, note: string) {
    const key = lineKey(line)
    setReviewMarks((current) => {
      const currentMark = current[key]
      const hasNote = note.trim().length > 0
      if (!hasNote && (!currentMark || currentMark.status === 'unreviewed')) {
        if (!(key in current)) return current
        const next = { ...current }
        delete next[key]
        return next
      }
      const nextMark: ReviewMark = {
        lineKey: key,
        status: currentMark?.status ?? 'unreviewed',
        updatedAt: Date.now(),
      }
      if (hasNote) nextMark.note = note
      return {
        ...current,
        [key]: nextMark,
      }
    })
  }

  function handleClearReviewMark(line: RpyLine) {
    const key = lineKey(line)
    setReviewMarks((current) => {
      const currentMark = current[key]
      if (!currentMark) return current
      if (currentMark.note?.trim()) {
        return {
          ...current,
          [key]: {
            ...currentMark,
            lineKey: key,
            status: 'unreviewed',
            updatedAt: Date.now(),
          },
        }
      }
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function handleExportReviewMarks() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaceName: snapshot?.name,
      marks: reviewMarks,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    anchor.href = url
    anchor.download = `rpy-review-${safeFileSegment(snapshot?.name ?? 'workspace')}-${date}.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    toast.success('校对数据已导出', `${Object.keys(reviewMarks).length} 条记录`)
  }

  async function handleImportReviewMarks(file: File) {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      const candidate = isRecord(parsed) && 'marks' in parsed ? parsed.marks : parsed
      const imported = normalizeReviewMarks(candidate)
      if (!imported) {
        toast.error('导入失败', '文件不是有效的校对数据 JSON')
        return
      }
      setReviewMarks((current) => ({
        ...current,
        ...imported,
      }))
      const count = Object.keys(imported).length
      setStatus(`已导入 ${count} 条校对记录`)
      toast.success('校对数据已导入', `${count} 条记录已合并到本地`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取导入文件失败'
      toast.error('导入失败', message)
    }
  }

  // Commands
  const commands = useMemo<CommandDefinition[]>(
    () => [
      {
        id: 'workspace:open',
        title: '打开工作区',
        hint: '选择 RenPy 项目根目录',
        group: '工作区',
        run: handleOpenWorkspace,
      },
      {
        id: 'workspace:rescan',
        title: '重新扫描工作区',
        hint: 'F5',
        group: '工作区',
        requiresWorkspace: true,
        shortcut: 'F5',
        run: handleRescan,
      },
      {
        id: 'workspace:forget',
        title: '关闭当前工作区',
        group: '工作区',
        requiresWorkspace: true,
        run: handleForgetWorkspace,
      },
      ...(['home', 'visual', 'review', 'sprite', 'assets', 'about'] as ViewKey[]).map(
        (target) => ({
          id: `nav:${target}`,
          title: `切换到 ${
            target === 'home' ? '首页'
              : target === 'visual' ? '可视化编辑器'
                : target === 'review' ? '文本 Review'
                  : target === 'sprite' ? '立绘库'
                    : target === 'assets' ? '资产管理'
                      : '关于'
          }`,
          group: '导航',
          run: () => setView(target),
        }),
      ),
      {
        id: 'edit:save-line',
        title: '保存当前行',
        shortcut: 'Ctrl+S',
        group: '编辑',
        requiresWorkspace: true,
        run: handleSaveLine,
      },
      {
        id: 'edit:save-all',
        title: '提交全部草稿',
        shortcut: 'Ctrl+Shift+S',
        group: '编辑',
        requiresWorkspace: true,
        run: handleSaveAllDrafts,
      },
      {
        id: 'edit:insert-show',
        title: '插入 show',
        group: '编辑',
        requiresWorkspace: true,
        run: () => handleInsertAt('show'),
      },
      {
        id: 'edit:insert-line-before',
        title: '在当前行上方插入',
        group: '编辑',
        requiresWorkspace: true,
        run: () => handleInsertLine('before'),
      },
      {
        id: 'edit:insert-line-after',
        title: '在当前行下方插入',
        group: '编辑',
        requiresWorkspace: true,
        run: () => handleInsertLine('after'),
      },
      {
        id: 'edit:delete-line',
        title: '删除当前行',
        group: '编辑',
        requiresWorkspace: true,
        run: handleDeleteLine,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot, drafts, selectedLine?.lineNumber, selectedLine?.filePath, selectedLine?.raw, currentDraftText, selectedState?.id, spritePosition, spriteTransition],
  )
  useRegisterCommands(commands, [commands])

  useHotkeys(
    [
      {
        combo: 'mod+s',
        handler: () => {
          if (fileMode === 'source' && sourceEditor.dirty) {
            void handleSaveSource()
          } else if (selectedLine?.editable && dirty) {
            void handleSaveLine()
          }
        },
        allowInInputs: true,
      },
      {
        combo: 'mod+shift+s',
        handler: () => void handleSaveAllDrafts(),
        allowInInputs: true,
      },
      { combo: 'F5', handler: () => void handleRescan() },
      { combo: 'j', handler: () => navigateLine(1), disabled: view !== 'sprite' },
      { combo: 'k', handler: () => navigateLine(-1), disabled: view !== 'sprite' },
    ],
    [fileMode, sourceEditor.dirty, selectedLine, dirty, drafts, view, currentDraftText],
  )

  function navigateLine(delta: number) {
    if (!snapshot || !selectedLine) return
    const lines = snapshot.index.lines.filter(
      (line) => line.filePath === selectedLine.filePath && line.editable,
    )
    const currentIdx = lines.findIndex(
      (line) => lineKey(line) === lineKey(selectedLine),
    )
    if (currentIdx === -1) return
    const next = Math.min(Math.max(currentIdx + delta, 0), lines.length - 1)
    setSelectedLineKey(lineKey(lines[next]))
  }

  const draftCount = Object.keys(drafts).length
  const diagnosticCount = snapshot?.index.diagnostics.length ?? 0

  if (isRestoring) {
    return <AppBootScreen status={status} theme={settings.theme} />
  }

  return (
    <div className="flex h-screen flex-col">
      <Topbar
        view={view}
        setView={setView}
        snapshot={snapshot}
        selectedPath={selectedFile?.path}
        isBusy={isBusy}
        onOpen={handleOpenWorkspace}
        onRescan={handleRescan}
        onForget={handleForgetWorkspace}
        onOpenCommandPalette={palette.open}
        hasUnsaved={hasUnsaved}
        theme={settings.theme}
        onToggleTheme={toggleTheme}
      />

      <StatusRail
        snapshot={snapshot}
        status={status}
        selectedLine={selectedLine}
        selectedState={selectedState}
        draftCount={draftCount}
        diagnosticCount={diagnosticCount}
      />

      <div className="flex-1 overflow-hidden">
        {view === 'home' && (
          <HomeView
            snapshot={snapshot}
            status={status}
            onNavigate={setView}
            onOpen={handleOpenWorkspace}
            onJumpDiagnostic={handleJumpDiagnostic}
            isBusy={isBusy}
            hasUnsaved={hasUnsaved}
            unsavedCount={draftCount}
          />
        )}

        {view === 'visual' && (
          <VisualView
            snapshot={snapshot}
            query={query}
            setQuery={setQuery}
            files={fileRows}
            selectedFile={selectedFile}
            onSelectFile={handleSelectFile}
            selectedLine={selectedLine}
            onSelectLine={(line) => setSelectedLineKey(lineKey(line))}
            selectedChapter={selectedChapter}
            fileMode={fileMode}
            setFileMode={setFileMode}
            sourceEditor={sourceEditor}
            onLoadSource={() => void handleLoadSource()}
            onSaveSource={() => void handleSaveSource()}
            onChangeSource={(content) =>
              setSourceEditor((current) => ({
                ...current,
                content,
                dirty: true,
                message: '有未保存修改',
              }))
            }
            onCopy={handleCopy}
            onSaveLine={(line) => void handleSaveLine(line)}
            onInsertLine={(position, line) => void handleInsertLine(position, line)}
            onDeleteLine={(line) => void handleDeleteLine(line)}
            draftSpeakerId={currentDraftSpeakerId}
            draftText={currentDraftText}
            setDraftText={setDraftText}
            setDraftSpeaker={setDraftSpeaker}
            isBusy={isBusy}
            dirty={dirty}
            canSaveLine={isLineDirty}
            dirtyByFile={dirtyByFile}
            theme={settings.theme}
          />
        )}

        {view === 'review' && (
          <ReviewView
            snapshot={snapshot}
            selectedLine={selectedLine}
            onSelectLine={(line) => setSelectedLineKey(lineKey(line))}
            draftText={currentDraftText}
            setDraftText={setDraftText}
            setDraftSpeaker={setDraftSpeaker}
            onSaveLine={(line) => void handleSaveLine(line)}
            onInsertLine={(position, line) => void handleInsertLine(position, line)}
            onDeleteLine={(line) => void handleDeleteLine(line)}
            draftSpeakerId={currentDraftSpeakerId}
            onSaveAllDrafts={() => void handleSaveAllDrafts()}
            isBusy={isBusy}
            dirty={dirty}
            canSaveLine={isLineDirty}
            onCopy={handleCopy}
            drafts={drafts}
            reviewMarks={reviewMarks}
            onMarkReview={handleMarkReview}
            onClearReviewMark={handleClearReviewMark}
            onUpdateReviewNote={handleUpdateReviewNote}
            onExportReviewMarks={handleExportReviewMarks}
            onImportReviewMarks={(file) => void handleImportReviewMarks(file)}
            onJumpToLine={handleJumpToLine}
            showLineOperationPanel={settings.reviewOperationPanelVisible}
            onToggleLineOperationPanel={toggleReviewOperationPanel}
          />
        )}

        {view === 'sprite' && (
          <SpriteView
            snapshot={snapshot}
            selectedLine={selectedLine}
            selectedState={selectedState}
            onSelectLine={(line) => setSelectedLineKey(lineKey(line))}
            onSelectState={setSelectedStateId}
            onApplyState={(state) => {
              void handleApplyDialogueSprite(state)
            }}
            onJumpToDefinition={handleJumpToLine}
            isBusy={isBusy}
            drafts={drafts}
            spriteCardScale={settings.spriteCardScale}
            onSpriteCardScaleChange={setSpriteCardScale}
          />
        )}

        {view === 'assets' && (
          <AssetsView
            snapshot={snapshot}
            assetTab={assetTab}
            setAssetTab={(tab) => {
              setAssetTab(tab)
              setSelectedAssetId(undefined)
            }}
            selectedAssetId={selectedAssetId}
            onSelectAsset={setSelectedAssetId}
            onCopy={handleCopy}
            onUpdateCharacter={handleUpdateCharacter}
            onUpdateChapter={handleUpdateChapter}
            onJumpToLine={handleJumpToLine}
            rules={assetRules}
            setRules={setAssetRules}
          />
        )}

        {view === 'about' && (
          <AboutView
            theme={settings.theme}
            setTheme={setTheme}
          />
        )}
      </div>
    </div>
  )
}

function AppBootScreen({
  status,
  theme,
}: {
  status: string
  theme: ThemeMode
}) {
  return (
    <div
      className="flex h-screen flex-col bg-background text-foreground"
      data-theme={theme}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex h-14 items-center border-b border-border px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-7 w-7 place-items-center rounded-md border border-border bg-card font-mono text-xs font-bold">
            RP
          </span>
          <div>
            <h1 className="text-sm font-semibold">Ren'Py Tool</h1>
            <p className="text-[11px] text-muted-foreground">启动工作区</p>
          </div>
        </div>
      </div>
      <div className="grid flex-1 place-items-center p-6">
        <div className="w-[min(560px,100%)]">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-info">Loading...</p>
              <h2 className="mt-1 text-2xl font-semibold">正在恢复编辑环境</h2>
            </div>
            <span className="font-mono text-xs text-muted-foreground">IDB / FS</span>
          </div>
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] border-b border-border text-xs">
              <span className="border-r border-border px-3 py-2 font-mono text-muted-foreground">
                workspace
              </span>
              <span className="truncate px-3 py-2">{status}</span>
            </div>
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] border-b border-border text-xs">
              <span className="border-r border-border px-3 py-2 font-mono text-muted-foreground">
                editor
              </span>
              <span className="truncate px-3 py-2">Monaco 本地模块准备中</span>
            </div>
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] text-xs">
              <span className="border-r border-border px-3 py-2 font-mono text-muted-foreground">
                index
              </span>
              <span className="truncate px-3 py-2">等待脚本索引与资产规则</span>
            </div>
            <div className="h-1 overflow-hidden bg-secondary">
              <div className="h-full w-1/3 animate-[boot-progress_1.15s_ease-in-out_infinite] bg-info" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function applyOverrides(
  snapshot: WorkspaceSnapshot,
  characterOverrides: ReturnType<typeof loadCharacterOverrides>,
  chapterOverrides: ReturnType<typeof loadChapterOverrides>,
) {
  for (const character of snapshot.index.characters) {
    const override = characterOverrides.byId[character.id]
    if (override) {
      if (override.displayName) character.displayName = override.displayName
      if (override.color) character.color = override.color
      if (override.note !== undefined) character.note = override.note
    }
  }
  for (const chapter of snapshot.index.chapters) {
    const override = chapterOverrides.byId[chapter.id]
    if (override) {
      if (override.title) chapter.title = override.title
      if (typeof override.order === 'number') chapter.order = override.order
      if (override.note !== undefined) chapter.note = override.note
    }
  }
  snapshot.index.chapters.sort((a, b) => a.order - b.order)
}

export default function App() {
  const [workspaceReady, setWorkspaceReady] = useState(false)

  return (
    <ToastProvider>
      <DialogProvider>
        <CommandPaletteProvider workspaceReady={workspaceReady}>
          <AppShell onWorkspaceReadyChange={setWorkspaceReady} />
        </CommandPaletteProvider>
      </DialogProvider>
    </ToastProvider>
  )
}
