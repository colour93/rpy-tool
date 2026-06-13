import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, HelpCircle, SkipForward, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/cn'
import { tourGuideSteps } from '@/services/tour-guide'
import type {
  TourGuideStepId,
  ViewKey,
  WorkspaceSnapshot,
} from '@/types'

interface TourGuideProps {
  open: boolean
  currentStepId?: TourGuideStepId
  snapshot?: WorkspaceSnapshot
  motionEnabled: boolean
  onOpenChange: (open: boolean) => void
  onStepChange: (stepId: TourGuideStepId) => void
  onNavigate: (view: ViewKey) => void
  onComplete: () => void
  onSkip: () => void
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

interface Size {
  width: number
  height: number
}

type Side = 'top' | 'bottom' | 'left' | 'right'

const VIEWPORT_MARGIN = 16
const SPOTLIGHT_PADDING = 8
const CARD_GAP = 14
const DEFAULT_CARD_SIZE: Size = { width: 360, height: 248 }

// Used until the anchor element is measured (or when it cannot be found).
// Centered-ish near the top-left so the card never renders off-screen.
const fallbackRect: Rect = {
  top: 96,
  left: 24,
  width: 320,
  height: 88,
}

const spotlightTransition = {
  type: 'spring',
  stiffness: 360,
  damping: 36,
  mass: 0.8,
} as const

const originBySide: Record<Side, string> = {
  top: 'center bottom',
  bottom: 'center top',
  left: 'right center',
  right: 'left center',
}

export function TourGuide({
  open,
  currentStepId,
  snapshot,
  motionEnabled,
  onOpenChange,
  onStepChange,
  onNavigate,
  onComplete,
  onSkip,
}: TourGuideProps) {
  const prefersReducedMotion = useReducedMotion()
  const shouldAnimate = motionEnabled && !prefersReducedMotion
  const availableSteps = useMemo(() => {
    if (snapshot) return tourGuideSteps
    return tourGuideSteps.filter((step) => !step.requiresWorkspace)
  }, [snapshot])
  const currentIndex = Math.max(
    0,
    availableSteps.findIndex((step) => step.id === currentStepId),
  )
  const step = availableSteps[currentIndex] ?? availableSteps[0]

  const cardRef = useRef<HTMLElement | null>(null)
  const [anchorRect, setAnchorRect] = useState<Rect>(fallbackRect)
  const [anchorFound, setAnchorFound] = useState(false)
  const [cardSize, setCardSize] = useState<Size>(DEFAULT_CARD_SIZE)
  const [viewport, setViewport] = useState<Size>(() => readViewport())

  // Read the current anchor's rect. Returns false when the element isn't in the
  // DOM yet (e.g. the target view just mounted) or hasn't been laid out, so the
  // caller can keep polling instead of snapping the spotlight to a stale spot.
  const locate = useCallback(() => {
    if (!step) return false
    const element = document.querySelector<HTMLElement>(
      `[data-tour="${step.anchor}"]`,
    )
    if (!element) return false
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return false
    setAnchorRect((prev) =>
      Math.abs(prev.top - rect.top) < 0.5 &&
      Math.abs(prev.left - rect.left) < 0.5 &&
      Math.abs(prev.width - rect.width) < 0.5 &&
      Math.abs(prev.height - rect.height) < 0.5
        ? prev
        : { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    )
    setAnchorFound(true)
    return true
  }, [step])

  // Measure the card from its layout box (offset*, so the entrance scale
  // animation doesn't feed a wrong size back into the placement math). Card
  // content — and therefore its size — only changes when the step does.
  useLayoutEffect(() => {
    const element = cardRef.current
    if (!element) return
    const next = { width: element.offsetWidth, height: element.offsetHeight }
    setCardSize((prev) =>
      Math.abs(prev.width - next.width) < 1 &&
      Math.abs(prev.height - next.height) < 1
        ? prev
        : next,
    )
  }, [step?.id, snapshot, open])

  const goPrevious = useCallback(() => {
    const previous = availableSteps[currentIndex - 1]
    if (previous) onStepChange(previous.id)
  }, [availableSteps, currentIndex, onStepChange])

  const goNext = useCallback(() => {
    if (!snapshot && step?.id === 'open-workspace') {
      onOpenChange(false)
      return
    }
    const next = availableSteps[currentIndex + 1]
    if (next) {
      onStepChange(next.id)
      return
    }
    onComplete()
  }, [
    availableSteps,
    currentIndex,
    onComplete,
    onOpenChange,
    onStepChange,
    snapshot,
    step?.id,
  ])

  // On step change the target view is still mounting, so poll a few frames
  // until its anchor is laid out. Crucially we keep the previous spotlight rect
  // until then (never snapping to a left-edge fallback), so the spotlight
  // springs straight from the old target to the new one with no detour.
  useEffect(() => {
    if (!open || !step) return
    onNavigate(step.view)

    let raf = 0
    let attempts = 0
    const poll = () => {
      if (locate()) return
      attempts += 1
      if (attempts > 60) {
        setAnchorFound(false)
        return
      }
      raf = window.requestAnimationFrame(poll)
    }
    raf = window.requestAnimationFrame(poll)

    const onReflow = () => locate()
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [locate, onNavigate, open, step])

  useEffect(() => {
    const onResize = () => setViewport(readViewport())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!open || !step) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrevious()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goNext, goPrevious, onOpenChange, open, step])

  const spotlight = useMemo(
    () => expandRect(anchorRect, SPOTLIGHT_PADDING, viewport),
    [anchorRect, viewport],
  )
  const placement = useMemo(
    () => placeCard(spotlight, cardSize, viewport),
    [spotlight, cardSize, viewport],
  )

  if (!step) return null

  const isLast = currentIndex === availableSteps.length - 1

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-80"
          initial={shouldAnimate ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          exit={shouldAnimate ? { opacity: 0 } : undefined}
          transition={{ duration: shouldAnimate ? 0.18 : 0 }}
          aria-live="polite"
        >
          {/* Click-catcher: closes on outside click. The scrim itself is drawn
              by the spotlight's box-shadow so the highlighted element stays bright. */}
          <button
            type="button"
            aria-label="关闭引导"
            className="absolute inset-0 cursor-default"
            onClick={() => onOpenChange(false)}
          />

          {/* Spotlight cutout — the giant box-shadow dims everything around it. */}
          <motion.div
            className={cn(
              'pointer-events-none absolute rounded-xl ring-2 ring-info transition-opacity duration-150',
              !anchorFound && 'opacity-0',
            )}
            style={{ boxShadow: '0 0 0 9999px rgba(2,6,23,0.55)' }}
            initial={false}
            animate={{
              top: spotlight.top,
              left: spotlight.left,
              width: spotlight.width,
              height: spotlight.height,
            }}
            transition={shouldAnimate ? spotlightTransition : { duration: 0 }}
          />

          {/* When the anchor is missing we still need a scrim behind the card. */}
          {!anchorFound && (
            <div className="pointer-events-none absolute inset-0 bg-foreground/55" />
          )}

          <motion.section
            ref={cardRef}
            key={step.id}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-guide-title"
            className="absolute w-[min(360px,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-2xl"
            style={{
              top: placement.top,
              left: placement.left,
              transformOrigin: originBySide[placement.side],
            }}
            initial={
              shouldAnimate ? { opacity: 0, scale: 0.96 } : false
            }
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldAnimate ? { opacity: 0, scale: 0.96 } : undefined}
            transition={{ duration: shouldAnimate ? 0.16 : 0 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Badge variant="info" className="mb-2">
                  {step.stage}
                </Badge>
                <h2 id="tour-guide-title" className="text-base font-semibold">
                  {step.title}
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => onOpenChange(false)}
                title="关闭"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">
              {step.body}
            </p>

            {!snapshot && step.id === 'open-workspace' && (
              <p className="mt-3 rounded-md border border-info/30 bg-info/10 p-2 text-xs text-info">
                打开工作区后，引导会补齐资产、立绘、校对和编辑步骤。
              </p>
            )}

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-xs tabular-nums text-muted-foreground">
                {currentIndex + 1} / {availableSteps.length}
              </span>
              <div className="flex flex-1 items-center gap-1">
                {availableSteps.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onStepChange(item.id)}
                    aria-label={`跳到第 ${index + 1} 步`}
                    className={cn(
                      'h-1.5 flex-1 rounded-full bg-border transition-colors',
                      index === currentIndex && 'bg-info',
                      index < currentIndex && 'bg-info/45',
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onSkip}>
                <SkipForward className="h-3.5 w-3.5" />
                跳过
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={goPrevious}
                  disabled={currentIndex === 0}
                >
                  上一步
                </Button>
                <Button type="button" variant="default" size="sm" onClick={goNext}>
                  {isLast ? (
                    <>
                      {snapshot ? <Check className="h-3.5 w-3.5" /> : null}
                      {snapshot ? '完成' : '稍后继续'}
                    </>
                  ) : (
                    '下一步'
                  )}
                </Button>
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function TourGuideButton({
  onClick,
  label = '引导',
  className,
}: {
  onClick: () => void
  label?: string
  className?: string
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className={className}
      title="打开用户旅程引导"
    >
      <HelpCircle className="h-3.5 w-3.5" />
      {label}
    </Button>
  )
}

function readViewport(): Size {
  if (typeof window === 'undefined') return { width: 1280, height: 800 }
  return { width: window.innerWidth, height: window.innerHeight }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function expandRect(rect: Rect, padding: number, viewport: Size): Rect {
  const top = Math.max(VIEWPORT_MARGIN / 2, rect.top - padding)
  const left = Math.max(VIEWPORT_MARGIN / 2, rect.left - padding)
  return {
    top,
    left,
    width: Math.min(viewport.width - left - VIEWPORT_MARGIN / 2, rect.width + padding * 2),
    height: Math.min(viewport.height - top - VIEWPORT_MARGIN / 2, rect.height + padding * 2),
  }
}

// Place the card next to the spotlight on whichever side has room. When the
// target is too large to sit beside (e.g. a full-height workbench panel), pin
// the card to the edge with the most free space instead of letting it float or
// overlap unpredictably.
function placeCard(
  spot: Rect,
  card: Size,
  viewport: Size,
): { top: number; left: number; side: Side } {
  const { width: vw, height: vh } = viewport
  const m = VIEWPORT_MARGIN
  const centerX = spot.left + spot.width / 2
  const centerY = spot.top + spot.height / 2

  const clampLeft = (value: number) =>
    clamp(value, m, Math.max(m, vw - card.width - m))
  const clampTop = (value: number) =>
    clamp(value, m, Math.max(m, vh - card.height - m))

  const alignedLeft = clampLeft(centerX - card.width / 2)
  const alignedTop = clampTop(centerY - card.height / 2)

  const spaceBelow = vh - (spot.top + spot.height)
  const spaceAbove = spot.top
  const spaceRight = vw - (spot.left + spot.width)
  const spaceLeft = spot.left

  const needVertical = card.height + CARD_GAP + m
  const needHorizontal = card.width + CARD_GAP + m

  if (spaceBelow >= needVertical) {
    return { top: spot.top + spot.height + CARD_GAP, left: alignedLeft, side: 'bottom' }
  }
  if (spaceAbove >= needVertical) {
    return { top: spot.top - CARD_GAP - card.height, left: alignedLeft, side: 'top' }
  }
  if (spaceRight >= needHorizontal) {
    return { top: alignedTop, left: spot.left + spot.width + CARD_GAP, side: 'right' }
  }
  if (spaceLeft >= needHorizontal) {
    return { top: alignedTop, left: spot.left - CARD_GAP - card.width, side: 'left' }
  }

  // No side fits — pin to the edge with the most room.
  const candidates: Array<{ space: number; top: number; left: number; side: Side }> = [
    { space: spaceBelow, top: clampTop(vh - card.height - m), left: alignedLeft, side: 'bottom' },
    { space: spaceAbove, top: m, left: alignedLeft, side: 'top' },
    { space: spaceRight, top: alignedTop, left: clampLeft(vw - card.width - m), side: 'right' },
    { space: spaceLeft, top: alignedTop, left: m, side: 'left' },
  ]
  candidates.sort((a, b) => b.space - a.space)
  return candidates[0]
}
