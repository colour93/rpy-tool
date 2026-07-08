import { basename, dirname, relative, resolve, sep } from 'node:path'
import { existsSync } from 'node:fs'
import { RenpyProjectSdk } from '../../src/sdk/project'
import {
  MemoryFileAdapter,
  type MemoryFileContent,
} from '../../src/sdk/memory-file-adapter'

const targetPath = process.env.RPY_SDK_FILE ?? process.env.RENPY_SDK_FILE
if (!targetPath) {
  throw new Error(
    '请设置 RPY_SDK_FILE=/path/to/file.rpy 后运行 bun run sdk:file-smoke',
  )
}

const absoluteTarget = resolve(targetPath)
if (!existsSync(absoluteTarget)) {
  throw new Error(`文件不存在：${absoluteTarget}`)
}

const root = resolve(process.env.RPY_SDK_ROOT ?? inferGameRoot(absoluteTarget))
const singleFileOnly = process.env.RPY_SDK_SINGLE_FILE === '1'
const files = singleFileOnly
  ? await readSingleFile(root, absoluteTarget)
  : await readWorkspaceFiles(root)
const targetKey = toAdapterPath(root, absoluteTarget)

if (!files[targetKey]) {
  files[targetKey] = await Bun.file(absoluteTarget).text()
}

const sdk = new RenpyProjectSdk(new MemoryFileAdapter(files, basename(root)))
const snapshot = await sdk.scan()
const targetLines = snapshot.index.lines.filter(
  (line) => line.filePath === targetKey,
)
const editableLines = targetLines.filter((line) => line.editable)
const byKind = countBy(targetLines.map((line) => line.kind))

console.log(
  JSON.stringify(
    {
      root,
      target: targetKey,
      scannedFiles: snapshot.files.length,
      totalLines: targetLines.length,
      editableLines: editableLines.length,
      byKind,
      characters: snapshot.index.characters.length,
      assets: snapshot.index.assets.length,
      referencedAssets: snapshot.index.assets.filter(
        (asset) => asset.referenced,
      ).length,
      firstEditable: editableLines[0]
        ? {
            lineNumber: editableLines[0].lineNumber,
            kind: editableLines[0].kind,
            raw: editableLines[0].raw.trim(),
          }
        : undefined,
    },
    null,
    2,
  ),
)

async function readSingleFile(root: string, filePath: string) {
  return {
    [toAdapterPath(root, filePath)]: await Bun.file(filePath).text(),
  } satisfies Record<string, MemoryFileContent>
}

async function readWorkspaceFiles(root: string) {
  const files: Record<string, MemoryFileContent> = {}
  for await (const filePath of new Bun.Glob('**/*').scan({
    cwd: root,
    absolute: true,
    onlyFiles: true,
  })) {
    if (!isSdkManagedFile(filePath)) continue
    files[toAdapterPath(root, filePath)] = filePath.endsWith('.rpy')
      ? await Bun.file(filePath).text()
      : Bun.file(filePath)
  }
  return files
}

function inferGameRoot(filePath: string) {
  const parts = filePath.split(sep)
  const gameIndex = parts.lastIndexOf('game')
  if (gameIndex >= 0) return parts.slice(0, gameIndex + 1).join(sep)
  return dirname(filePath)
}

function toAdapterPath(root: string, filePath: string) {
  return normalizePath(relative(root, filePath) || basename(filePath))
}

function normalizePath(path: string) {
  return path.split(sep).join('/')
}

function isSdkManagedFile(filePath: string) {
  return /\.(rpy|png|jpe?g|webp|gif|bmp|avif|svg|ogg|mp3|wav|flac|m4a)$/i.test(
    filePath,
  )
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1
    return acc
  }, {})
}
