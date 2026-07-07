import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FolderOpen,
  ListChecks,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  buildHealthItems,
  countKind,
  diagnosticGroup,
  lineKey,
} from '@/appHelpers'
import { cn } from '@/lib/cn'
import type {
  Diagnostic,
  ReviewMark,
  ViewKey,
  WorkspaceSnapshot,
} from '@/types'

export function HomeView({
  snapshot,
  status,
  onNavigate,
  onOpen,
  onJumpDiagnostic,
  isBusy,
  hasUnsaved,
  unsavedCount,
  reviewMarks,
}: {
  snapshot?: WorkspaceSnapshot
  status: string
  onNavigate: (view: ViewKey) => void
  onOpen: () => void
  onJumpDiagnostic: (diagnostic: Diagnostic) => void
  isBusy: boolean
  hasUnsaved: boolean
  unsavedCount: number
  reviewMarks: Record<string, ReviewMark>
}) {
  const metrics = [
    { label: 'Rpy 文件', value: countKind(snapshot, 'rpy') },
    {
      label: '可编辑行',
      value: snapshot?.index.lines.filter((line) => line.editable).length ?? 0,
    },
    { label: '角色', value: snapshot?.index.characters.length ?? 0 },
    { label: '资源', value: snapshot?.index.assets.length ?? 0 },
    { label: '草稿', value: unsavedCount },
    { label: '诊断', value: snapshot?.index.diagnostics.length ?? 0 },
  ]
  const healthItems = buildHealthItems(snapshot)
  const diagnostics = snapshot?.index.diagnostics ?? []
  const grouped = diagnosticGroup(diagnostics)
  const visibleDiagnostics = [
    ...grouped.errors,
    ...grouped.warnings,
    ...grouped.info,
  ].slice(0, 16)
  const editableCount =
    snapshot?.index.lines.filter((line) => line.editable).length ?? 0
  const assetDiagnostic = diagnostics.find(
    (diagnostic) =>
      diagnostic.jumpTo === 'assets' ||
      `${diagnostic.message} ${diagnostic.hint ?? ''}`.includes('资源'),
  )
  const nextAction = !snapshot
    ? {
        eyebrow: '准备',
        title: '打开一个 RenPy 工作区',
        meta: '选择 game 目录或项目根目录后开始索引',
        label: '打开工作区',
        icon: FolderOpen,
        onClick: onOpen,
        disabled: isBusy,
      }
    : unsavedCount > 0
      ? {
          eyebrow: '继续处理',
          title: `${unsavedCount} 行草稿等待写回`,
          meta: '先处理未保存内容，再继续校对或查分',
          label: '查看草稿',
          icon: ClipboardCheck,
          onClick: () => onNavigate('review'),
          disabled: false,
        }
      : hasUnsaved
        ? {
            eyebrow: '继续处理',
            title: '源文件草稿未保存',
            meta: '回到编辑器保存或放弃当前源文件修改',
            label: '继续编辑',
            icon: ClipboardCheck,
            onClick: () => onNavigate('visual'),
            disabled: false,
          }
        : grouped.errors.length > 0
          ? {
              eyebrow: '需要处理',
              title: `${grouped.errors.length} 个错误诊断`,
              meta: grouped.errors[0]?.message ?? '先定位最高优先级诊断',
              label: '定位诊断',
              icon: AlertTriangle,
              onClick: () => {
                const diagnostic = grouped.errors[0]
                if (diagnostic) onJumpDiagnostic(diagnostic)
              },
              disabled: false,
            }
          : assetDiagnostic
            ? {
                eyebrow: '校准项目',
                title: '检查资源路径与分类规则',
                meta: assetDiagnostic.message,
                label: '打开资产管理',
                icon: ArrowRight,
                onClick: () => onNavigate('assets'),
                disabled: false,
              }
            : editableCount > 0
              ? {
                  eyebrow: '建议下一步',
                  title: '进入文本 Review 开始校对',
                  meta: `${editableCount} 行可编辑文本可进入队列`,
                  label: '进入 Review',
                  icon: ArrowRight,
                  onClick: () => onNavigate('review'),
                  disabled: false,
                }
              : {
                  eyebrow: '建议下一步',
                  title: '查看资产和章节索引',
                  meta: '确认项目是否被正确识别',
                  label: '打开资产管理',
                  icon: ArrowRight,
                  onClick: () => onNavigate('assets'),
                  disabled: false,
                }
  const NextActionIcon = nextAction.icon
  const reviewableLines =
    snapshot?.index.lines.filter(
      (line) =>
        line.editable &&
        (line.kind === 'dialogue' ||
          line.kind === 'narration' ||
          line.kind === 'choice'),
    ) ?? []
  const approvedCount = reviewableLines.filter(
    (line) => reviewMarks[lineKey(line)]?.status === 'approved',
  ).length
  const ignoredCount = reviewableLines.filter(
    (line) => reviewMarks[lineKey(line)]?.status === 'ignored',
  ).length
  const needsChangeCount = reviewableLines.filter(
    (line) => reviewMarks[lineKey(line)]?.status === 'needs-change',
  ).length
  const unreviewedCount = Math.max(
    0,
    reviewableLines.length - approvedCount - ignoredCount - needsChangeCount,
  )
  const reviewOpenCount = unreviewedCount + needsChangeCount

  return (
    <main className="h-[calc(100vh-var(--shell-chrome))] overflow-auto scrollbar-thin">
      <div className="mx-auto grid max-w-7xl gap-5 p-6">
        <section
          className="rounded-lg border border-border-strong bg-card p-5"
          data-tour="home-overview"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase text-muted-foreground">
                数据统计
              </p>
              <h1 className="mt-1 truncate text-2xl font-bold">
                {snapshot ? snapshot.name : '未打开工作区'}
              </h1>
              <p
                className="mt-1 truncate text-xs text-muted-foreground"
                title={status}
              >
                {status}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={snapshot ? () => onNavigate('visual') : onOpen}
                disabled={isBusy}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {snapshot ? '继续编辑' : '打开工作区'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate('assets')}
                disabled={!snapshot}
              >
                资源
              </Button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {metrics.map((metric) => (
              <article
                key={metric.label}
                className="rounded-md border border-border bg-secondary/50 p-3"
              >
                <span className="text-xs text-muted-foreground">
                  {metric.label}
                </span>
                <strong className="mt-2 block text-2xl leading-none">
                  {metric.value}
                </strong>
              </article>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary/50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase text-info">
                {nextAction.eyebrow}
              </p>
              <strong className="mt-0.5 block truncate text-sm">
                {nextAction.title}
              </strong>
              <span className="block truncate text-[11px] text-muted-foreground">
                {nextAction.meta}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={nextAction.onClick}
              disabled={nextAction.disabled}
            >
              <NextActionIcon className="h-3.5 w-3.5" />
              {nextAction.label}
            </Button>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-base font-semibold">项目健康</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {healthItems.map((item) => (
              <div
                key={item.label}
                className={cn(
                  'flex min-h-12 items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2',
                  item.level === 'ok' && 'border-success/40 bg-success/5',
                  item.level === 'warning' && 'border-warning/40 bg-warning/10',
                )}
              >
                <strong className="text-xs">{item.label}</strong>
                <span className="text-right text-[11px] text-muted-foreground">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">收尾复查</h3>
              <span className="text-[11px] text-muted-foreground">
                草稿 / 诊断 / 校对状态
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <FinishCheckItem
                title="草稿"
                value={unsavedCount > 0 ? `${unsavedCount} 行` : '清空'}
                done={unsavedCount === 0}
                onClick={() => onNavigate('review')}
                disabled={!snapshot || unsavedCount === 0}
              />
              <FinishCheckItem
                title="诊断"
                value={
                  diagnostics.length > 0 ? `${diagnostics.length} 项` : '健康'
                }
                done={diagnostics.length === 0}
                onClick={() => {
                  const diagnostic = visibleDiagnostics[0]
                  if (diagnostic) onJumpDiagnostic(diagnostic)
                }}
                disabled={!snapshot || diagnostics.length === 0}
              />
              <FinishCheckItem
                title="校对"
                value={
                  reviewableLines.length === 0
                    ? '无队列'
                    : needsChangeCount > 0
                      ? `${needsChangeCount} 行需修改`
                      : unreviewedCount > 0
                        ? `${unreviewedCount} 行未校对`
                        : '完成'
                }
                done={reviewableLines.length > 0 && reviewOpenCount === 0}
                onClick={() => onNavigate('review')}
                disabled={!snapshot || reviewableLines.length === 0}
              />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">诊断</h2>
            <p className="text-[11px] text-muted-foreground">
              {grouped.errors.length} 错误 · {grouped.warnings.length} 警告 ·{' '}
              {grouped.info.length} 提示
            </p>
          </div>
          <div className="mt-3 grid gap-2">
            {visibleDiagnostics.map((diagnostic) => (
              <button
                key={diagnostic.id}
                type="button"
                onClick={() => onJumpDiagnostic(diagnostic)}
                className="grid grid-cols-[4rem_1fr_auto] items-start gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:bg-secondary"
              >
                <span
                  className={cn(
                    'rounded-full px-2 py-1 text-center text-[10px] font-bold uppercase',
                    diagnostic.severity === 'error' &&
                      'bg-destructive/15 text-destructive',
                    diagnostic.severity === 'warning' &&
                      'bg-warning/15 text-warning-foreground',
                    diagnostic.severity === 'info' && 'bg-info/15 text-info',
                  )}
                >
                  {diagnostic.severity === 'error'
                    ? '错误'
                    : diagnostic.severity === 'warning'
                      ? '警告'
                      : '提示'}
                </span>
                <div className="min-w-0">
                  <strong className="block truncate text-xs">
                    {diagnostic.message}
                  </strong>
                  {diagnostic.hint && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {diagnostic.hint}
                    </span>
                  )}
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {diagnostic.filePath
                    ? `${diagnostic.filePath}${diagnostic.lineNumber ? `:${diagnostic.lineNumber}` : ''}`
                    : '全局'}
                </span>
              </button>
            ))}
            {visibleDiagnostics.length === 0 && (
              <div className="rounded-md border border-border bg-secondary/50 p-4 text-sm text-muted-foreground">
                暂无诊断。
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function FinishCheckItem({
  title,
  value,
  done,
  onClick,
  disabled,
}: {
  title: string
  value: string
  done: boolean
  onClick: () => void
  disabled?: boolean
}) {
  const Icon = done ? CheckCircle2 : ListChecks
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-12 items-center gap-3 rounded-md border border-border bg-secondary/50 px-3 py-2 text-left transition-colors',
        done && 'border-success/40 bg-success/5',
        !done && !disabled && 'hover:border-info/40 hover:bg-info/10',
        disabled && 'cursor-default opacity-80',
      )}
    >
      <Icon
        className={cn(
          'h-4 w-4 shrink-0',
          done ? 'text-success' : 'text-muted-foreground',
        )}
      />
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-xs">{title}</strong>
        <span className="block truncate text-[11px] text-muted-foreground">
          {value}
        </span>
      </span>
    </button>
  )
}
