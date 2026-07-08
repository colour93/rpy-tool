import type { FileEntry, WorkspaceSnapshot } from '@/types'
import { BrowserFileSystemAdapter } from '@/sdk/browser-file-adapter'
import { RenpyProjectSdk } from '@/sdk/project'
import type { RenpyFileEdit } from '@/sdk/file-adapter'
import { idbDelete, idbGet, idbSet } from './storage'

const WORKSPACE_KEY = 'current'
const WORKSPACE_HISTORY_KEY = 'history'
const MAX_WORKSPACE_HISTORY = 8

let activeSdk: RenpyProjectSdk | undefined

export interface WorkspaceHistoryEntry {
  id: string
  name: string
  openedAt: number
  handle: FileSystemDirectoryHandle
}

export function getWorkspaceSdk() {
  if (!activeSdk) throw new Error('当前没有打开工作区')
  return activeSdk
}

export async function openWorkspace() {
  if (!window.showDirectoryPicker) {
    throw new Error(
      '当前浏览器不支持 File System Access API，请使用 Chrome 或 Edge。',
    )
  }

  const handle = await window.showDirectoryPicker({ mode: 'readwrite' })
  await idbSet('workspace', WORKSPACE_KEY, handle)
  await rememberWorkspace(handle)
  return scanWorkspace(handle)
}

export async function restoreWorkspace(options?: {
  requestPermission?: boolean
}) {
  const handle = await idbGet<FileSystemDirectoryHandle>(
    'workspace',
    WORKSPACE_KEY,
  )
  if (!handle) return undefined

  const permission = await verifyPermission(
    handle,
    Boolean(options?.requestPermission),
  )
  if (!permission) return undefined

  return scanWorkspace(handle)
}

export async function restoreWorkspaceHandle(
  handle: FileSystemDirectoryHandle,
  options?: { requestPermission?: boolean },
) {
  const permission = await verifyPermission(
    handle,
    Boolean(options?.requestPermission),
  )
  if (!permission) return undefined
  await idbSet('workspace', WORKSPACE_KEY, handle)
  await rememberWorkspace(handle)
  return scanWorkspace(handle)
}

export async function forgetWorkspace() {
  activeSdk = undefined
  await idbDelete('workspace', WORKSPACE_KEY)
}

export async function loadWorkspaceHistory() {
  const history = await idbGet<WorkspaceHistoryEntry[]>(
    'workspace',
    WORKSPACE_HISTORY_KEY,
  )
  if (history) return history
  const current = await idbGet<FileSystemDirectoryHandle>(
    'workspace',
    WORKSPACE_KEY,
  )
  return current
    ? [
        {
          id: workspaceHandleId(current),
          name: current.name,
          openedAt: 0,
          handle: current,
        },
      ]
    : []
}

export async function forgetWorkspaceHistoryEntry(id: string) {
  const history = await loadWorkspaceHistory()
  await idbSet(
    'workspace',
    WORKSPACE_HISTORY_KEY,
    history.filter((entry) => entry.id !== id),
  )
}

export async function scanWorkspace(rootHandle: FileSystemDirectoryHandle) {
  activeSdk = new RenpyProjectSdk(new BrowserFileSystemAdapter(rootHandle))
  return activeSdk.scan()
}

/**
 * 增量重扫：只重新索引指定文件列表
 * 用于保存文件后仅更新影响的文件而不全盘重扫
 */
export async function rescanFiles(
  snapshot: WorkspaceSnapshot,
  filePaths: string[],
) {
  return getWorkspaceSdk().rescanFiles(snapshot, filePaths)
}

export async function readTextFile(fileOrPath: FileEntry | string) {
  return getWorkspaceSdk().readTextFile(fileOrPath)
}

export async function writeTextFile(
  fileOrPath: FileEntry | string,
  content: string,
) {
  await getWorkspaceSdk().writeTextFile(fileOrPath, content)
}

export async function readBlob(fileOrPath: FileEntry | string) {
  return getWorkspaceSdk().readBlob(fileOrPath)
}

export async function statFile(fileOrPath: FileEntry | string) {
  return getWorkspaceSdk().statFile(fileOrPath)
}

export async function undoFileEdit(
  snapshot: WorkspaceSnapshot,
  edit: RenpyFileEdit,
) {
  return getWorkspaceSdk().undoFileEdit(snapshot, edit)
}

async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  requestIfNeeded: boolean,
) {
  const descriptor = { mode: 'readwrite' as const }
  if ((await handle.queryPermission(descriptor)) === 'granted') return true
  if (!requestIfNeeded) return false
  return (await handle.requestPermission(descriptor)) === 'granted'
}

async function rememberWorkspace(handle: FileSystemDirectoryHandle) {
  const history = await loadWorkspaceHistory()
  const id = workspaceHandleId(handle)
  const next: WorkspaceHistoryEntry[] = [
    { id, name: handle.name, openedAt: Date.now(), handle },
    ...history.filter((entry) => entry.id !== id),
  ].slice(0, MAX_WORKSPACE_HISTORY)
  await idbSet('workspace', WORKSPACE_HISTORY_KEY, next)
}

function workspaceHandleId(handle: FileSystemDirectoryHandle) {
  return handle.name
}
