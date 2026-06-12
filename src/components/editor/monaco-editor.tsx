import { lazy, Suspense, useCallback } from 'react'
import { cn } from '@/lib/cn'

const MonacoEditor = lazy(() =>
  import('@monaco-editor/react').then((module) => ({
    default: module.default,
  })),
)

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
  const handleChange = useCallback(
    (next: string | undefined) => {
      onChange(next ?? '')
    },
    [onChange],
  )

  const lang = guessLanguage(filePath, language)

  return (
    <div className={cn('h-full w-full overflow-hidden bg-card', className)}>
      <Suspense fallback={<EditorFallback />}>
        <MonacoEditor
          height="100%"
          language={lang}
          theme={theme === 'dark' ? 'vs-dark' : 'vs'}
          value={value}
          onChange={handleChange}
          options={{
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
          }}
        />
      </Suspense>
    </div>
  )
}

function EditorFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
      Loading editor…
    </div>
  )
}

function guessLanguage(filePath: string | undefined, fallback: string) {
  if (!filePath) return fallback
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'rpy':
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
