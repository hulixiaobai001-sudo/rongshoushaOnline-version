// ============================================
// 安全的 localStorage 封装
// ============================================
// 隐私模式 / 被浏览器策略禁用 / 存储配额满时，直接调用 localStorage 会抛异常
// （Safari 无痕模式 setItem 直接抛 QuotaExceededError）。
// 渲染期抛错 = 组件树崩溃；事件回调里抛错 = 未捕获错误。统一走这里兜底。
// ============================================

export function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function storageSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function storageRemove(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}
