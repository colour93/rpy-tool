import { useEffect } from 'react'

interface Hotkey {
  combo: string // 例如 "mod+s", "mod+shift+s"
  handler: (event: KeyboardEvent) => void
  /** 当目标是输入控件时是否仍然触发，默认 false */
  allowInInputs?: boolean
  /** 当条件不满足时禁用 */
  disabled?: boolean
}

function matches(combo: string, event: KeyboardEvent) {
  const tokens = combo.toLowerCase().split('+')
  const key = tokens[tokens.length - 1]
  const modifiers = tokens.slice(0, -1)
  const wantsMod = modifiers.includes('mod')
  const isMac = navigator.platform.toLowerCase().includes('mac')
  const wantsCtrl = modifiers.includes('ctrl') || (wantsMod && !isMac)
  const wantsMeta = modifiers.includes('meta') || (wantsMod && isMac)

  if (event.ctrlKey !== wantsCtrl) return false
  if (event.metaKey !== wantsMeta) return false
  if (event.shiftKey !== modifiers.includes('shift')) return false
  if (event.altKey !== modifiers.includes('alt')) return false

  return event.key.toLowerCase() === key
}

function isInputTarget(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

/**
 * 注册一组键盘快捷键
 */
export function useHotkeys(hotkeys: Hotkey[], deps: React.DependencyList = []) {
  useEffect(() => {
    function handle(event: KeyboardEvent) {
      for (const hotkey of hotkeys) {
        if (hotkey.disabled) continue
        if (!matches(hotkey.combo, event)) continue
        if (!hotkey.allowInInputs && isInputTarget(event)) continue
        event.preventDefault()
        hotkey.handler(event)
        return
      }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
