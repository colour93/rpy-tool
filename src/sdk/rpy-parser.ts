import type {
  AssetRegistryItem,
  ChapterRegistryItem,
  CharacterRegistryItem,
  CharacterState,
  Diagnostic,
  FileEntry,
  RpyIndex,
  RpyLine,
} from '@/types'
import { normalizePathKey, normalizeRuntimePath } from '@/services/path-utils'

const characterColors = [
  '#2563eb',
  '#dc2626',
  '#059669',
  '#7c3aed',
  '#ca8a04',
  '#0891b2',
  '#db2777',
  '#475569',
]

interface ParseLineOptions {
  allowEditableText?: boolean
}

interface ParseBlock {
  indent: number
  kind: 'story' | 'non-story'
}

export async function buildRpyIndex(
  files: FileEntry[],
  readText: (file: FileEntry) => Promise<string>,
): Promise<RpyIndex> {
  const rpyFiles = files
    .filter((file) => file.kind === 'rpy')
    .sort((a, b) => a.path.localeCompare(b.path))
  const lines: RpyLine[] = []
  const linesByFile: Record<string, RpyLine[]> = {}
  const diagnostics: Diagnostic[] = []
  const characters = new Map<string, CharacterRegistryItem>()
  const states = new Map<string, CharacterState[]>()
  const imageAliases = new Map<string, string>()
  const imageLines: RpyLine[] = []
  const labels: RpyLine[] = []
  const assets = new Map<string, AssetRegistryItem>()
  const referencedAssets = new Map<string, RpyLine>()
  const characterDefinitions = new Map<
    string,
    { id: string; displayName: string; imageTag?: string }
  >()

  for (const file of rpyFiles) {
    let text: string
    try {
      text = await readText(file)
    } catch (error) {
      diagnostics.push({
        id: `read-fail:${file.path}`,
        severity: 'error',
        message: `无法读取 ${file.path}：${error instanceof Error ? error.message : '未知错误'}`,
        filePath: file.path,
      })
      continue
    }

    const parsedLines = parseFileLines(text, file.path)
    const fileLines: RpyLine[] = []

    parsedLines.forEach((line) => {
      lines.push(line)
      fileLines.push(line)

      if (line.kind === 'label' && line.target) {
        labels.push(line)
      }

      if (line.kind === 'define' && line.characterId) {
        const displayName = line.text ?? line.characterId
        characterDefinitions.set(line.characterId, {
          id: line.characterId,
          displayName,
          imageTag: line.target,
        })
        upsertCharacter(characters, line.characterId, displayName)
        if (line.target) {
          imageAliases.set(line.target, line.characterId)
        }
      }

      if (line.kind === 'image' && line.target) {
        imageLines.push(line)

        if (line.text && isManagedAssetPath(line.text)) {
          addAssetReference(assets, referencedAssets, line.text, line, {
            tags: line.target.split(/\s+/).filter(Boolean),
          })
        }
      }

      if (
        (line.kind === 'play' || line.kind === 'voice') &&
        line.text &&
        !line.text.startsWith('$')
      ) {
        addAssetReference(assets, referencedAssets, line.text, line, {
          category:
            line.kind === 'voice'
              ? 'voice'
              : line.target === 'sound'
                ? 'sfx'
                : 'bgm',
          tags: [line.kind],
        })
      }

      for (const assetPath of extractStaticManagedAssetPaths(line.raw)) {
        addAssetReference(assets, referencedAssets, assetPath, line)
      }
    })

    linesByFile[file.path] = fileLines
  }

  inferCharacterImageAliases(imageLines, characterDefinitions, imageAliases)

  for (const line of imageLines) {
    const state = imageLineToState(line, imageAliases)
    if (!state) continue
    const list = states.get(state.characterId) ?? []
    list.push(state)
    states.set(state.characterId, list)
    upsertCharacter(characters, state.characterId, state.characterId)
  }

  // 处理未被脚本引用的资源文件
  for (const file of files) {
    if (file.kind === 'image' || file.kind === 'audio') {
      const runtimePath = normalizeRuntimePath(file.path)
      const existing = assets.get(runtimePath)
      const category = existing?.category ?? categoryFromPath(runtimePath)
      assets.set(runtimePath, {
        id: runtimePath,
        category,
        path: runtimePath,
        tags: existing?.tags?.length ? existing.tags : inferTags(runtimePath),
        file,
        referenced: existing?.referenced ?? false,
      })
    }
  }

  const characterList = Array.from(characters.values()).map(
    (character, index) => ({
      ...character,
      color: character.color ?? characterColors[index % characterColors.length],
      states: states.get(character.id) ?? character.states,
    }),
  )

  const chapters: ChapterRegistryItem[] = labels.map((line, index) => ({
    id: line.target ?? `${line.filePath}:${line.lineNumber}`,
    title: titleFromLabel(line.target ?? `chapter_${index + 1}`),
    entryLabel: line.target ?? '',
    order: index + 1,
    filePath: line.filePath,
    lineNumber: line.lineNumber,
  }))

  if (rpyFiles.length === 0) {
    diagnostics.push({
      id: 'no-rpy',
      severity: 'warning',
      message: '当前工作区没有扫描到 .rpy 文件。',
      hint: '检查目录或调整 .gitignore 规则',
    })
  }

  diagnostics.push(...buildRelationshipDiagnostics(lines, labels))
  diagnostics.push(...buildAssetDiagnostics(files, referencedAssets))

  return {
    lines,
    linesByFile,
    characters: characterList,
    assets: Array.from(assets.values()).sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
    chapters,
    labels,
    diagnostics,
    indexedAt: Date.now(),
  }
}

function parseFileLines(text: string, filePath: string) {
  const blocks: ParseBlock[] = []
  return text.split(/\r?\n/).map((raw, index) => {
    const trimmed = raw.trim()
    const indent = raw.match(/^(\s*)/)?.[1].length ?? 0

    if (trimmed && !trimmed.startsWith('#')) {
      while (blocks.length > 0 && indent <= blocks[blocks.length - 1].indent) {
        blocks.pop()
      }
    }

    const allowEditableText =
      blocks.some((block) => block.kind === 'non-story') === false &&
      blocks.some((block) => block.kind === 'story')
    const line = parseLine(raw, filePath, index + 1, { allowEditableText })
    const blockKind = blockKindForLine(trimmed)
    if (blockKind) blocks.push({ indent, kind: blockKind })
    return line
  })
}

function blockKindForLine(trimmed: string): ParseBlock['kind'] | undefined {
  if (!trimmed || trimmed.startsWith('#') || !trimmed.endsWith(':')) {
    return undefined
  }

  if (/^label\s+[A-Za-z_][\w.]*(?:\s*\([^)]*\))?\s*:/.test(trimmed)) {
    return 'story'
  }

  if (/^translate\s+\w+\s+strings\s*:/.test(trimmed)) {
    return 'non-story'
  }

  if (/^translate\s+\w+\s+[A-Za-z_][\w.]*\s*:/.test(trimmed)) {
    return 'story'
  }

  if (/^(screen|style|transform)\b/.test(trimmed)) return 'non-story'
  if (/^(init\b.*\bpython|init|python)\s*:/.test(trimmed)) {
    return 'non-story'
  }

  return undefined
}

function parseImageCommand(trimmed: string, keyword: 'show' | 'scene') {
  if (!trimmed.startsWith(`${keyword} `)) return undefined

  let rest = stripTrailingCommentOutsideStrings(
    trimmed.slice(keyword.length).trim(),
  )
  const withMatch = rest.match(/\s+with\s+([A-Za-z_]\w*)\s*$/)
  const modifier = withMatch?.[1]
  if (withMatch) rest = rest.slice(0, withMatch.index).trim()

  if (keyword === 'scene') {
    const layerOnly = rest.match(/^onlayer\s+([A-Za-z_][\w.-]*)\s*$/)
    if (layerOnly) return { target: undefined, modifier }
  }

  const target = imageSpecifierName(rest)
  if (!target) return undefined
  return { target, modifier }
}

function imageSpecifierName(value: string) {
  const tokens = splitWhitespaceOutsideStrings(value)
  if (tokens.length === 0) return undefined
  const stopWords = new Set(['onlayer', 'at', 'as', 'zorder', 'behind'])
  const parts: string[] = []

  for (const token of tokens) {
    if (stopWords.has(token)) break
    parts.push(token)
  }

  return parts.join(' ').trim() || undefined
}

export function parseLine(
  raw: string,
  filePath: string,
  lineNumber: number,
  options: ParseLineOptions = {},
) {
  const indentMatch = raw.match(/^(\s*)/)
  const indent = indentMatch ? indentMatch[1] : ''
  const trimmed = raw.trim()
  const allowEditableText = options.allowEditableText ?? true
  const base = {
    filePath,
    lineNumber,
    raw,
    editable: false,
    indent,
  } satisfies Pick<
    RpyLine,
    'filePath' | 'lineNumber' | 'raw' | 'editable' | 'indent'
  >

  if (!trimmed) return { ...base, kind: 'blank' } satisfies RpyLine
  if (trimmed.startsWith('#')) {
    return { ...base, kind: 'comment' } satisfies RpyLine
  }

  const label = trimmed.match(/^label\s+([A-Za-z_][\w.]*)(?:\s*\([^)]*\))?\s*:/)
  if (label) {
    return { ...base, kind: 'label', target: label[1] } satisfies RpyLine
  }

  const jump = trimmed.match(/^jump\s+([A-Za-z_][\w.]*)/)
  if (jump) {
    return { ...base, kind: 'jump', target: jump[1] } satisfies RpyLine
  }

  const call = trimmed.match(/^call\s+([A-Za-z_][\w.]*)/)
  if (call) {
    return { ...base, kind: 'call', target: call[1] } satisfies RpyLine
  }

  const define = parseCharacterDefine(trimmed)
  if (define) {
    return {
      ...base,
      kind: 'define',
      characterId: define.characterId,
      target: define.imageTag,
      text: define.displayName,
    } satisfies RpyLine
  }

  const image = trimmed.match(/^image\s+(.+?)\s*=\s*(.+)$/)
  if (image) {
    return {
      ...base,
      kind: 'image',
      target: image[1],
      text: firstStaticManagedAssetPath(image[2]),
    } satisfies RpyLine
  }

  // menu: 选择分支
  if (/^menu\s*:?\s*$/.test(trimmed)) {
    return { ...base, kind: 'menu' } satisfies RpyLine
  }

  // 菜单选项："xxx": / "xxx" if condition:
  const choice = trimmed.match(/^"(.+?)"(?:\s+if\s+.+)?\s*:\s*$/)
  if (choice && allowEditableText) {
    return {
      ...base,
      kind: 'choice',
      text: choice[1],
      editable: true,
    } satisfies RpyLine
  }

  const show = parseImageCommand(trimmed, 'show')
  if (show) {
    return {
      ...base,
      kind: 'show',
      target: show.target,
      modifier: show.modifier,
    } satisfies RpyLine
  }

  const scene = parseImageCommand(trimmed, 'scene')
  if (scene) {
    return {
      ...base,
      kind: 'scene',
      target: scene.target,
      modifier: scene.modifier,
    } satisfies RpyLine
  }

  const play = trimmed.match(/^play\s+(music|sound)\s+(.+)/)
  if (play) {
    return {
      ...base,
      kind: 'play',
      target: play[1],
      text: firstStaticManagedAssetPath(play[2]) ?? unquotePath(play[2]),
    } satisfies RpyLine
  }

  const voice = trimmed.match(/^voice\s+(.+)/)
  if (voice) {
    return {
      ...base,
      kind: 'voice',
      text: firstStaticManagedAssetPath(voice[1]) ?? unquotePath(voice[1]),
    } satisfies RpyLine
  }

  if (/^(init|python|\$)/.test(trimmed)) {
    return { ...base, kind: 'python' } satisfies RpyLine
  }

  // 角色对白：支持 `e "..."` 与 `e happy "..."`.
  const dialogue = trimmed.match(
    /^([A-Za-z_]\w*)(?:\s+((?:[A-Za-z_]\w*)(?:\s+[A-Za-z_]\w*)*))?\s+(['"])(.*)\3(?:\s+with\s+(\w+))?\s*$/,
  )
  if (dialogue && allowEditableText) {
    return {
      ...base,
      kind: 'dialogue',
      characterId: dialogue[1],
      target: dialogue[2],
      text: dialogue[4],
      modifier: dialogue[5],
      editable: true,
    } satisfies RpyLine
  }

  const narration = trimmed.match(/^(['"])(.*)\1(?:\s+with\s+(\w+))?\s*$/)
  if (narration && allowEditableText) {
    return {
      ...base,
      kind: 'narration',
      text: narration[2],
      modifier: narration[3],
      editable: true,
    } satisfies RpyLine
  }

  return { ...base, kind: 'unknown' } satisfies RpyLine
}

export function replaceEditableLine(raw: string, text: string) {
  const dialogue = raw.match(
    /^(\s*[A-Za-z_]\w*(?:\s+[A-Za-z_]\w*)*\s+)(['"])(.*)(\2)(\s+with\s+\w+)?(\s*)$/,
  )
  if (dialogue) {
    return `${dialogue[1]}${dialogue[2]}${escapeRenpyText(text, dialogue[2])}${dialogue[4]}${dialogue[5] ?? ''}${dialogue[6] ?? ''}`
  }

  const narration = raw.match(/^(\s*)(['"])(.*)(\2)(\s+with\s+\w+)?(\s*)$/)
  if (narration) {
    return `${narration[1]}${narration[2]}${escapeRenpyText(text, narration[2])}${narration[4]}${narration[5] ?? ''}${narration[6] ?? ''}`
  }

  const choice = raw.match(/^(\s*)"(.*)"(\s*:\s*)$/)
  if (choice) {
    return `${choice[1]}"${escapeRenpyText(text, '"')}"${choice[3]}`
  }

  return raw
}

export function replaceLineSpeaker(raw: string, characterId: string | null) {
  const dialogue = raw.match(
    /^(\s*)([A-Za-z_]\w*)((?:\s+[A-Za-z_]\w*)*)\s+(['"])(.*)(\4)(\s+with\s+\w+)?(\s*)$/,
  )
  if (dialogue) {
    const [
      ,
      indent,
      ,
      attributes = '',
      quote,
      text,
      closingQuote,
      modifier = '',
      trailing = '',
    ] = dialogue
    if (!characterId)
      return `${indent}${quote}${text}${closingQuote}${modifier}${trailing}`
    return `${indent}${characterId}${attributes} ${quote}${text}${closingQuote}${modifier}${trailing}`
  }

  const narration = raw.match(/^(\s*)(['"])(.*)(\2)(\s+with\s+\w+)?(\s*)$/)
  if (narration) {
    const [, indent, quote, text, closingQuote, modifier = '', trailing = ''] =
      narration
    if (!characterId) return raw
    return `${indent}${characterId} ${quote}${text}${closingQuote}${modifier}${trailing}`
  }

  return raw
}

export function replaceDialogueSprite(raw: string, state: CharacterState) {
  const dialogue = raw.match(
    /^(\s*)([A-Za-z_]\w*)(?:\s+[A-Za-z_]\w*)*\s+(['"])(.*)(\3)(\s+with\s+\w+)?(\s*)$/,
  )
  if (!dialogue) return raw
  const [
    ,
    indent,
    characterId,
    quote,
    text,
    closingQuote,
    modifier = '',
    trailing = '',
  ] = dialogue
  const attributes = dialogueAttributesFromState(state)
  const head = [characterId, attributes].filter(Boolean).join(' ')
  return `${indent}${head} ${quote}${text}${closingQuote}${modifier}${trailing}`
}

/**
 * 构建插入 show 命令的字符串
 */
export function buildShowCommand(options: {
  imageTag: string
  position?: string
  transition?: string
  indent?: string
  variant?: 'show' | 'scene'
}) {
  const {
    imageTag,
    position,
    transition,
    indent = '    ',
    variant = 'show',
  } = options
  const parts: string[] = [`${indent}${variant} ${imageTag}`]
  if (position) parts.push(`at ${position}`)
  const command = parts.join(' ')
  return transition ? `${command} with ${transition}` : command
}

function dialogueAttributesFromState(state: CharacterState) {
  return state.imageTag.split(/\s+/).filter(Boolean).slice(1).join(' ')
}

function buildRelationshipDiagnostics(lines: RpyLine[], labels: RpyLine[]) {
  const labelNames = new Set(labels.map((line) => line.target).filter(Boolean))
  return lines
    .filter(
      (line) =>
        (line.kind === 'jump' || line.kind === 'call') &&
        line.target &&
        !labelNames.has(line.target),
    )
    .map((line) => ({
      id: `missing-label:${line.filePath}:${line.lineNumber}`,
      severity: 'warning' as const,
      message: `${line.kind} 目标 ${line.target} 未在当前索引中找到`,
      filePath: line.filePath,
      lineNumber: line.lineNumber,
      hint: '检查 label 命名或者新建 label',
      jumpTo: 'visual' as const,
    }))
}

function buildAssetDiagnostics(
  files: FileEntry[],
  referencedAssets: Map<string, RpyLine>,
) {
  const indexedPaths = new Set(files.map((file) => normalizePathKey(file.path)))
  const assetFiles = files.filter(
    (file) => file.kind === 'image' || file.kind === 'audio',
  )
  const diagnostics: Diagnostic[] = []

  for (const [path, line] of referencedAssets) {
    if (!looksLikePath(path) || indexedPaths.has(normalizePathKey(path)))
      continue
    const candidates = findAssetPathCandidates(path, assetFiles)
    diagnostics.push({
      id: `missing-asset:${line.filePath}:${line.lineNumber}`,
      severity: 'warning',
      message: `脚本引用的资源 ${path} 不在当前文件索引中`,
      filePath: line.filePath,
      lineNumber: line.lineNumber,
      hint:
        candidates.length > 0
          ? `脚本引用: ${path}；可能文件: ${candidates.join(' / ')}；检查目录前缀、大小写或文件名。`
          : `脚本引用: ${path}；未找到同名候选文件，确认文件路径或将资源放入工作区。`,
      jumpTo: 'assets',
    })
  }

  for (const file of files) {
    if (
      file.kind === 'image' &&
      normalizePathKey(file.path).startsWith('images/') &&
      file.size >= 768 * 1024
    ) {
      diagnostics.push({
        id: `large-image:${file.path}`,
        severity: 'info',
        message: `${file.path} 将优先生成缩略图用于展示`,
        filePath: file.path,
        jumpTo: 'assets',
      })
    }
  }

  return diagnostics
}

function addAssetReference(
  assets: Map<string, AssetRegistryItem>,
  referencedAssets: Map<string, RpyLine>,
  rawPath: string,
  line: RpyLine,
  options: {
    category?: AssetRegistryItem['category']
    tags?: string[]
  } = {},
) {
  if (!isManagedAssetPath(rawPath)) return
  const assetPath = normalizeRuntimePath(rawPath)
  const existing = assets.get(assetPath)
  referencedAssets.set(assetPath, line)
  assets.set(assetPath, {
    id: assetPath,
    category:
      options.category ?? existing?.category ?? categoryFromPath(assetPath),
    path: assetPath,
    tags: mergeTags(existing?.tags, options.tags ?? ['reference']),
    file: existing?.file,
    referenced: true,
  })
}

function mergeTags(existing: string[] | undefined, incoming: string[]) {
  return Array.from(new Set([...(existing ?? []), ...incoming].filter(Boolean)))
}

function upsertCharacter(
  characters: Map<string, CharacterRegistryItem>,
  id: string,
  displayName: string,
) {
  if (characters.has(id)) return
  characters.set(id, {
    id,
    displayName,
    source: 'parsed',
    states: [],
  })
}

function inferCharacterImageAliases(
  imageLines: RpyLine[],
  characterDefinitions: Map<
    string,
    { id: string; displayName: string; imageTag?: string }
  >,
  imageAliases: Map<string, string>,
) {
  const imageTags = new Set(
    imageLines
      .map((line) => line.target?.split(/\s+/).filter(Boolean)[0])
      .filter((tag): tag is string => Boolean(tag)),
  )

  for (const character of characterDefinitions.values()) {
    if (character.imageTag) continue
    for (const candidate of characterImageTagCandidates(character.id)) {
      if (!imageTags.has(candidate) || imageAliases.has(candidate)) continue
      imageAliases.set(candidate, character.id)
      break
    }
  }
}

function characterImageTagCandidates(characterId: string) {
  const candidates = new Set<string>([characterId])
  for (const suffix of ['_character', '_char', '_speaker', '_name', '_c']) {
    if (characterId.endsWith(suffix)) {
      candidates.add(characterId.slice(0, -suffix.length))
    }
  }
  if (characterId.startsWith('c_')) candidates.add(characterId.slice(2))
  return Array.from(candidates).filter(Boolean)
}

function imageLineToState(
  line: RpyLine,
  imageAliases: Map<string, string>,
): CharacterState | undefined {
  if (!line.target) return undefined
  const parts = line.target.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return undefined
  const characterId = imageAliases.get(parts[0]) ?? parts[0]
  const labelParts = parts.slice(1)

  return {
    id: line.target,
    characterId,
    label: labelParts.join(' ') || 'default',
    expression: labelParts[0],
    pose: labelParts[1],
    imageTag: line.target,
    path: line.text ? normalizeRuntimePath(line.text) : undefined,
    sourceFile: line.filePath,
    lineNumber: line.lineNumber,
  }
}

function parseCharacterDefine(trimmed: string) {
  const match = trimmed.match(
    /^define\s+([A-Za-z_]\w*)\s*=\s*Character\((.*)\)\s*$/,
  )
  if (!match) return undefined
  const [, characterId, args] = match
  const displayName = args.match(/^\s*(["'])(.*?)\1/)?.[2] ?? characterId
  const imageTag = args.match(/(?:^|,)\s*image\s*=\s*(["'])(.*?)\1/)?.[2]
  return { characterId, displayName, imageTag }
}

function unquotePath(value: string) {
  const match = value.trim().match(/^(['"])(.*?)\1/)
  return match ? match[2] : value.trim()
}

function firstStaticManagedAssetPath(value: string) {
  return extractStaticManagedAssetPaths(value)[0]
}

function extractStaticManagedAssetPaths(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.startsWith('#')) return []
  const paths = extractQuotedStrings(stripTrailingCommentOutsideStrings(raw))
    .filter(isManagedAssetPath)
    .map((path) => normalizeRuntimePath(path))
  return Array.from(new Set(paths))
}

function stripTrailingCommentOutsideStrings(raw: string) {
  let quote: string | undefined
  let escaped = false
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '#') return raw.slice(0, index)
  }
  return raw
}

function extractQuotedStrings(raw: string) {
  const values: string[] = []
  let quote: string | undefined
  let escaped = false
  let buffer = ''

  for (const char of raw) {
    if (!quote) {
      if (char === '"' || char === "'") {
        quote = char
        buffer = ''
      }
      continue
    }

    if (escaped) {
      buffer += char
      escaped = false
      continue
    }

    if (char === '\\') {
      escaped = true
      continue
    }

    if (char === quote) {
      values.push(buffer)
      quote = undefined
      buffer = ''
      continue
    }

    buffer += char
  }

  return values
}

function splitWhitespaceOutsideStrings(raw: string) {
  const tokens: string[] = []
  let quote: string | undefined
  let escaped = false
  let buffer = ''

  for (const char of raw) {
    if (escaped) {
      buffer += char
      escaped = false
      continue
    }

    if (char === '\\') {
      buffer += char
      escaped = true
      continue
    }

    if (quote) {
      buffer += char
      if (char === quote) quote = undefined
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      buffer += char
      continue
    }

    if (/\s/.test(char)) {
      if (buffer) {
        tokens.push(buffer)
        buffer = ''
      }
      continue
    }

    buffer += char
  }

  if (buffer) tokens.push(buffer)
  return tokens
}

function isManagedAssetPath(value: string | undefined) {
  if (!value) return false
  const normalized = normalizeRuntimePath(value.trim())
  if (!normalized || /^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) return false
  if (/[[\]{}]/.test(normalized)) return false
  return /\.(png|jpe?g|webp|gif|bmp|avif|svg|ogg|mp3|wav|flac|m4a)$/i.test(
    normalized,
  )
}

function escapeRenpyText(text: string, quote: string) {
  return text.replaceAll('\\', '\\\\').replaceAll(quote, `\\${quote}`)
}

function titleFromLabel(label: string) {
  return label
    .replace(/^label_?/, '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function categoryFromPath(path: string): AssetRegistryItem['category'] {
  const normalized = normalizePathKey(path)
  if (normalized.includes('/bgm/') || normalized.includes('music')) return 'bgm'
  if (normalized.includes('/sfx/') || normalized.includes('sound')) return 'sfx'
  if (normalized.includes('/voice/')) return 'voice'
  if (
    normalized.startsWith('gui/') ||
    normalized.includes('/gui/') ||
    normalized.startsWith('new_gui/') ||
    normalized.includes('/new_gui/')
  ) {
    return 'ui'
  }
  if (normalized.includes('/character') || normalized.includes('/sprite')) {
    return 'character'
  }
  if (normalized.includes('/bg/') || normalized.includes('background'))
    return 'bg'
  if (normalized.includes('/ui/')) return 'ui'
  if (normalized.includes('/fx/')) return 'fx'
  return normalized.match(/\.(ogg|mp3|wav|flac|m4a)$/) ? 'sfx' : 'cg'
}

function inferTags(path: string) {
  return normalizeRuntimePath(path)
    .split(/[/. _-]+/)
    .filter((part) => part.length > 2)
    .slice(0, 5)
}

function looksLikePath(value: string) {
  return /[/.]/.test(value) && !value.includes(' ')
}

function findAssetPathCandidates(path: string, files: FileEntry[]) {
  const normalized = normalizePathKey(path)
  const basename = normalized.split('/').at(-1) ?? normalized
  const stem = basename.replace(/\.[^.]+$/, '')
  const extension = basename.includes('.') ? basename.split('.').at(-1) : ''
  const segments = normalized.split('/').filter(Boolean)

  return files
    .map((file) => {
      const candidate = normalizePathKey(file.path)
      const candidateBasename = candidate.split('/').at(-1) ?? candidate
      const candidateStem = candidateBasename.replace(/\.[^.]+$/, '')
      const candidateExtension = candidateBasename.includes('.')
        ? candidateBasename.split('.').at(-1)
        : ''
      let score = 0

      if (candidate === normalized) score += 100
      if (candidateBasename === basename) score += 70
      if (candidateStem === stem) score += 45
      if (extension && candidateExtension === extension) score += 10
      if (candidate.endsWith(`/${basename}`)) score += 25
      if (stem.length > 2 && candidate.includes(stem)) score += 15
      score += commonSuffixLength(segments, candidate.split('/')) * 12

      return { path: file.path, score }
    })
    .filter((candidate) => candidate.score >= 35)
    .sort(
      (left, right) =>
        right.score - left.score || left.path.localeCompare(right.path),
    )
    .slice(0, 3)
    .map((candidate) => candidate.path)
}

function commonSuffixLength(left: string[], right: string[]) {
  let count = 0
  while (
    count < left.length &&
    count < right.length &&
    left[left.length - 1 - count] === right[right.length - 1 - count]
  ) {
    count += 1
  }
  return count
}
