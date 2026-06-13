import { useEffect, useMemo, useRef, useState } from 'react'
import * as monaco from 'monaco-editor'
import { cn } from '@/lib/cn'

const RENPY_LANGUAGE_ID = 'renpy'
let renpyLanguageConfigured = false

export interface MonacoSourceEditorProps {
  value: string
  onChange: (next: string) => void
  language?: string
  theme?: 'light' | 'dark'
  readOnly?: boolean
  className?: string
  filePath?: string
}

export function MonacoSourceEditor({
  value,
  onChange,
  language = 'python',
  theme = 'dark',
  readOnly = false,
  className,
  filePath,
}: MonacoSourceEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)
  const applyingExternalValue = useRef(false)
  const [ready, setReady] = useState(false)
  const lang = guessLanguage(filePath, language)
  const modelUri = useMemo(() => makeModelUri(filePath, lang), [filePath, lang])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    configureRenpyLanguage(monaco)

    const model = monaco.editor.createModel(value, lang, modelUri)
    const editor = monaco.editor.create(node, {
      model,
      theme: theme === 'dark' ? 'vs-dark' : 'vs',
      minimap: { enabled: false },
      fontFamily: 'Cascadia Mono, JetBrains Mono, Consolas, monospace',
      fontSize: 13,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 4,
      wordWrap: 'on',
      readOnly,
      padding: { top: 12, bottom: 12 },
      renderLineHighlight: 'all',
      smoothScrolling: true,
    })
    editorRef.current = editor
    setReady(true)

    const contentSubscription = editor.onDidChangeModelContent(() => {
      if (applyingExternalValue.current) return
      onChangeRef.current(editor.getValue())
    })

    return () => {
      contentSubscription.dispose()
      const currentModel = editor.getModel()
      editor.dispose()
      currentModel?.dispose()
      editorRef.current = null
    }
    // Create the editor once; later effects swap model/options.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    configureRenpyLanguage(monaco)

    const currentModel = editor.getModel()
    if (currentModel?.uri.toString() === modelUri.toString()) {
      monaco.editor.setModelLanguage(currentModel, lang)
      return
    }

    const nextModel =
      monaco.editor.getModel(modelUri) ??
      monaco.editor.createModel(value, lang, modelUri)
    editor.setModel(nextModel)
    currentModel?.dispose()
  }, [lang, modelUri, value])

  useEffect(() => {
    const model = editorRef.current?.getModel()
    if (!model || model.getValue() === value) return
    applyingExternalValue.current = true
    model.setValue(value)
    applyingExternalValue.current = false
  }, [value])

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly })
  }, [readOnly])

  useEffect(() => {
    monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs')
  }, [theme])

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-card', className)}>
      <div ref={containerRef} className="h-full w-full" />
      {!ready && <EditorFallback />}
    </div>
  )
}

function EditorFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-card text-sm text-muted-foreground">
      Loading editor...
    </div>
  )
}

function makeModelUri(filePath: string | undefined, languageId: string) {
  const safePath =
    filePath
      ?.split('/')
      .map((part) => encodeURIComponent(part))
      .join('/') || `untitled.${languageId}`
  return monaco.Uri.parse(`inmemory://rpy-tool/${safePath}`)
}

function configureRenpyLanguage(monacoInstance: typeof monaco) {
  if (renpyLanguageConfigured) return
  renpyLanguageConfigured = true

  const hasRenpy = monacoInstance.languages
    .getLanguages()
    .some((item) => item.id === RENPY_LANGUAGE_ID)
  if (!hasRenpy) {
    monacoInstance.languages.register({
      id: RENPY_LANGUAGE_ID,
      extensions: ['.rpy'],
      aliases: ['RenPy', "Ren'Py", 'renpy'],
    })
  }

  monacoInstance.languages.setLanguageConfiguration(RENPY_LANGUAGE_ID, {
    comments: {
      lineComment: '#',
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '{', close: '}' },
    ],
    surroundingPairs: [
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: '{', close: '}' },
    ],
    indentationRules: {
      increaseIndentPattern: /^\s*(?:label|menu|screen|transform|init|python|if|elif|else|for|while|try|except|finally|with|imagebutton|button|vbox|hbox|frame|viewport)\b.*:\s*(?:#.*)?$/,
      decreaseIndentPattern: /^\s*(?:elif|else|except|finally)\b.*:\s*(?:#.*)?$/,
    },
  })

  monacoInstance.languages.setMonarchTokensProvider(RENPY_LANGUAGE_ID, {
    defaultToken: '',
    tokenPostfix: '.renpy',
    keywords: [
      'label',
      'jump',
      'call',
      'return',
      'menu',
      'choice',
      'if',
      'elif',
      'else',
      'while',
      'for',
      'in',
      'init',
      'python',
      'default',
      'define',
      'transform',
      'screen',
      'use',
      'has',
      'style',
      'image',
      'scene',
      'show',
      'hide',
      'with',
      'at',
      'onlayer',
      'as',
      'play',
      'queue',
      'stop',
      'voice',
      'pause',
      'window',
      'nvl',
      'extend',
      'pass',
    ],
    constants: [
      'True',
      'False',
      'None',
      'Dissolve',
      'Fade',
      'MoveTransition',
      'Character',
    ],
    operators: [
      '=',
      '>',
      '<',
      '!',
      '~',
      '?',
      ':',
      '==',
      '<=',
      '>=',
      '!=',
      'and',
      'or',
      'not',
    ],
    tokenizer: {
      root: [
        [/^\s*#.*$/, 'comment'],
        [/^\s*(label)(\s+)([A-Za-z_][\w.]*)(\s*:)/, ['keyword', '', 'type.identifier', 'delimiter']],
        [/^\s*(menu|init|python|screen|transform|style)(\b)/, ['keyword', '']],
        [/^\s*(image)(\s+)([A-Za-z_][\w\s.-]*?)(\s*=)/, ['keyword', '', 'type.identifier', 'operator']],
        [/^\s*(define|default)(\s+)([A-Za-z_]\w*)(\s*=)/, ['keyword', '', 'variable.predefined', 'operator']],
        [/^\s*(scene|show|hide)(\s+)([A-Za-z_][\w\s.-]*)/, ['keyword', '', 'string.key']],
        [/^\s*(play|queue|stop|voice)(\s+)([A-Za-z_][\w\s.-]*)?/, ['keyword', '', 'string.key']],
        [/^\s*(jump|call)(\s+)([A-Za-z_][\w.]*)/, ['keyword', '', 'type.identifier']],
        [/[A-Za-z_]\w*(?=\s*")/, 'variable.predefined'],
        [/[A-Za-z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@constants': 'constant',
            '@operators': 'operator',
            '@default': 'identifier',
          },
        }],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@doubleString'],
        [/'([^'\\]|\\.)*$/, 'string.invalid'],
        [/'/, 'string', '@singleString'],
        [/\d+(?:\.\d+)?/, 'number'],
        [/[{}()[\]]/, '@brackets'],
        [/[=<>!~?:]+/, 'operator'],
      ],
      doubleString: [
        [/\\./, 'string.escape'],
        [/\[[^\]]+\]/, 'variable'],
        [/"/, 'string', '@pop'],
        [/[^\\["]+/, 'string'],
        [/./, 'string'],
      ],
      singleString: [
        [/\\./, 'string.escape'],
        [/'/, 'string', '@pop'],
        [/[^\\']+/, 'string'],
        [/./, 'string'],
      ],
    },
  })
}

function guessLanguage(filePath: string | undefined, fallback: string) {
  if (!filePath) return fallback
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'rpy':
      return RENPY_LANGUAGE_ID
    case 'py':
      return 'python'
    case 'json':
      return 'json'
    case 'md':
      return 'markdown'
    case 'yml':
    case 'yaml':
      return 'yaml'
    case 'js':
    case 'jsx':
      return 'javascript'
    case 'ts':
    case 'tsx':
      return 'typescript'
    case 'css':
      return 'css'
    case 'html':
      return 'html'
    default:
      return fallback
  }
}
