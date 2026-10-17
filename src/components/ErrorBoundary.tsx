import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

// ============================================
// React 渲染错误边界
// ============================================
// 渲染期错误由这里接住，fallback 仍然由 React 自己渲染（不手工改 DOM），
// 因此不会出现「React 的节点被外层替换掉 → removeChild NotFoundError」的连锁崩溃。
// 说明：事件回调里的异常不会被 ErrorBoundary 捕获，那些交给全局兜底提示。
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('❌ React 渲染错误（已由 ErrorBoundary 接住）', error, info.componentStack)
  }

  handleReload = () => {
    try { window.location.reload() } catch { /* ignore */ }
  }

  handleCopy = () => {
    const err = this.state.error
    const text = err ? `${err.message}\n\n${err.stack || ''}` : ''
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).catch(() => { /* ignore */ })
      }
    } catch {
      // ignore
    }
  }

  render() {
    if (!this.state.error) return this.props.children

    const err = this.state.error
    return (
      <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col items-center justify-center p-6 gap-4">
        <div className="text-5xl">💥</div>
        <h1 className="text-xl font-bold text-red-300">页面渲染出错了</h1>
        <p className="text-sm text-slate-400 text-center max-w-md">
          游戏状态可能已中断。点击下方按钮重新加载即可恢复。
        </p>
        <pre className="w-full max-w-2xl max-h-56 overflow-auto rounded-lg border border-slate-700 bg-slate-800 p-3 text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap break-all">
          {err.message}
          {err.stack ? '\n\n' + err.stack.split('\n').slice(0, 6).join('\n') : ''}
        </pre>
        <div className="flex gap-3">
          <button
            onClick={this.handleReload}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
          >
            重新加载
          </button>
          <button
            onClick={this.handleCopy}
            className="px-5 py-2.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm"
          >
            复制错误信息
          </button>
        </div>
      </div>
    )
  }
}
