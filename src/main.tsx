import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installGlobalErrorHandlers, reportError } from './lib/errorReporter'

// 全局兜底：出错时只弹一条悬浮提示，绝不替换 React 管理的 DOM。
// （旧实现会 root.innerHTML = '<错误页>'，导致后续任何渲染都抛
//   NotFoundError: Failed to execute 'removeChild' on 'Node'）
installGlobalErrorHandlers()

console.log('🎮 绒兽杀加载中...')

const container = document.getElementById('root')

if (!container) {
  reportError('初始化错误', new Error('找不到 #root 挂载点'))
} else {
  try {
    createRoot(container).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  } catch (e) {
    // createRoot/render 的同步异常：只提示，不改 DOM
    reportError('渲染错误', e)
  }
}
