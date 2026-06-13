import {
  FileCheck2,
  FolderOpen,
  HelpCircle,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ThemeMode } from '@/types'

const projectNotes = [
  {
    title: '本地离线处理',
    body: '通过浏览器 File System Access API 读写本机 RenPy 工作区。',
    icon: FolderOpen,
  },
  {
    title: '建议版本管理',
    body: '工具会直接写回脚本文件，建议在 Git 或其他版本管理下使用。',
    icon: ShieldCheck,
  },
  {
    title: '面向写后流程',
    body: '定位于编写后的校对、审阅、修改和立绘查分。',
    icon: FileCheck2,
  },
]

export function AboutView({
  theme,
  setTheme,
  motionEnabled,
  setMotionEnabled,
  onOpenTourGuide,
}: {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  motionEnabled: boolean
  setMotionEnabled: (enabled: boolean) => void
  onOpenTourGuide: () => void
}) {
  return (
    <main className="h-[calc(100vh-var(--shell-chrome))] overflow-auto scrollbar-thin">
      <div className="mx-auto grid max-w-4xl gap-5 p-6">
        <section
          className="rounded-lg border border-border bg-card p-5"
          data-tour="about-settings"
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <h1 className="text-xl font-semibold">关于</h1>
            <div
              className="flex flex-wrap items-center justify-end gap-2"
              data-tour="about-guide-actions"
            >
              <div className="flex items-center gap-1 rounded-md bg-secondary p-1">
                <Button
                  variant={theme === 'light' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTheme('light')}
                  title="浅色模式"
                >
                  <Sun className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={theme === 'dark' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTheme('dark')}
                  title="深色模式"
                >
                  <Moon className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button
                variant={motionEnabled ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMotionEnabled(!motionEnabled)}
                aria-pressed={motionEnabled}
                title="切换过渡动画"
              >
                <Sparkles className="h-3.5 w-3.5" />
                动画
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenTourGuide}
                title="重新打开用户旅程引导"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                引导
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p>一个尝试性的 vibe 项目，灵感来自于杏仁狮老师的立绘插入工具。</p>
            <p>
              <a
                href="https://github.com/colour93/rpy-tool"
                target="_blank"
                rel="noopener"
                className="text-blue-500"
              >
                @colour93/rpy-tool
              </a>
            </p>
          </div>
        </section>
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h1 className="text-xl font-semibold">说明</h1>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {projectNotes.map((note) => {
              const Icon = note.icon
              return (
                <article
                  key={note.title}
                  className="rounded-md border border-border bg-background p-4"
                >
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-info">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-semibold">{note.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {note.body}
                  </p>
                </article>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}
