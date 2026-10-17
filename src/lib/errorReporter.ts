// ============================================
// 全局错误兜底（非破坏性）
// ============================================
// 历史事故：main.tsx 曾经在 window 'error' / 'unhandledrejection' 里执行
//   root.innerHTML = '<错误页>'
// —— 这会把 React 正在管理的 DOM 节点直接替换掉。之后只要有一次状态更新/
// 组件卸载，React 就会对着已经不存在的节点调用 removeChild，抛出：
//   NotFoundError: Failed to execute 'removeChild' on 'Node':
//   The node to be removed is not a child of this node.
// 于是「一个无害的小错误」会升级成整个界面崩溃且无法恢复。
//
// 现在改为：错误只写一条固定悬浮提示（append 到 document.body，不碰 React 根节点），
// React 自己的渲染错误交给 ErrorBoundary 处理。
// ============================================

const MAX_LINES = 5
// 这类错误是浏览器/扩展的良性噪声，不提示
const IGNORED_PATTERNS = [
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
]

let panel: HTMLDivElement | null = null
let linesBox: HTMLDivElement | null = null
const recent = new Map<string, number>()

function isIgnored(message: string): boolean {
  return IGNORED_PATTERNS.some(re => re.test(message))
}

function ensurePanel(): HTMLDivElement | null {
  try {
    if (typeof document === 'undefined' || !document.body) return null
    if (panel && document.body.contains(panel)) return panel

    panel = document.createElement('div')
    panel.setAttribute('data-rs-error-panel', '1')
    panel.style.cssText = [
      'position:fixed',
      'left:12px',
      'bottom:12px',
      'z-index:2147483647',
      'max-width:min(560px,calc(100vw - 24px))',
      'max-height:40vh',
      'overflow:auto',
      'background:#1e293b',
      'color:#e2e8f0',
      'border:1px solid #ef4444',
      'border-radius:10px',
      'padding:10px 12px',
      'font:11px/1.5 ui-monospace,Consolas,monospace',
      'box-shadow:0 8px 24px rgba(0,0,0,.45)',
    ].join(';')

    const header = document.createElement('div')
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;'

    const title = document.createElement('strong')
    title.textContent = '⚠️ 页面出现异常（游戏可继续玩）'
    title.style.cssText = 'color:#fca5a5;font-size:12px;'

    const buttons = document.createElement('span')
    const reload = document.createElement('button')
    reload.textContent = '重新加载'
    reload.style.cssText = 'margin-right:6px;padding:2px 8px;border-radius:6px;border:1px solid #475569;background:#334155;color:#e2e8f0;font-size:11px;cursor:pointer;'
    reload.onclick = () => { try { window.location.reload() } catch { /* ignore */ } }
    const close = document.createElement('button')
    close.textContent = '关闭'
    close.style.cssText = 'padding:2px 8px;border-radius:6px;border:1px solid #475569;background:transparent;color:#94a3b8;font-size:11px;cursor:pointer;'
    close.onclick = () => { try { panel?.remove() } catch { /* ignore */ } panel = null; linesBox = null }
    buttons.appendChild(reload)
    buttons.appendChild(close)

    header.appendChild(title)
    header.appendChild(buttons)

    linesBox = document.createElement('div')

    panel.appendChild(header)
    panel.appendChild(linesBox)
    document.body.appendChild(panel)
    return panel
  } catch {
    return null
  }
}

/** 记录一条错误：控制台 + 非破坏性悬浮提示（绝不操作 React 根节点） */
export function reportError(title: string, err: unknown): void {
  try {
    // eslint-disable-next-line no-console
    console.error('❌ ' + title, err)
    const message = err instanceof Error
      ? `${err.message}\n${(err.stack || '').split('\n').slice(0, 3).join('\n')}`
      : String(err)
    if (isIgnored(message)) return

    const key = `${title}:${message.slice(0, 160)}`
    const count = (recent.get(key) || 0) + 1
    recent.set(key, count)
    if (count > 3) return // 同一错误刷屏时最多提示 3 次

    const box = ensurePanel()
    if (!box || !linesBox) return

    const line = document.createElement('div')
    line.style.cssText = 'margin:4px 0;padding-top:4px;border-top:1px solid #334155;color:#cbd5e1;white-space:pre-wrap;word-break:break-word;'
    line.textContent = `[${new Date().toLocaleTimeString()}] ${title}${count > 1 ? `（第 ${count} 次）` : ''}\n${message}`
    linesBox.appendChild(line)
    while (linesBox.childElementCount > MAX_LINES) {
      linesBox.firstElementChild?.remove()
    }
  } catch {
    // 兜底逻辑自身绝不能再抛错
  }
}

/** 安装全局兜底：只提示，不篡改 React 管理的 DOM */
export function installGlobalErrorHandlers(): void {
  try {
    window.addEventListener('error', (event) => {
      // ErrorEvent 才带错误信息；资源加载错误不走这里
      const err = (event as ErrorEvent).error ?? (event as ErrorEvent).message
      reportError('运行时错误', err)
    })
    window.addEventListener('unhandledrejection', (event) => {
      reportError('未处理的 Promise 错误', (event as PromiseRejectionEvent).reason)
    })
  } catch {
    // ignore
  }
}
