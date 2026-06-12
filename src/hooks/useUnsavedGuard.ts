import { useEffect } from 'react'

/**
 * 在窗口关闭/页面卸载时阻止丢弃未保存内容
 */
export function useUnsavedGuard(hasUnsaved: boolean) {
  useEffect(() => {
    if (!hasUnsaved) return
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsaved])
}
