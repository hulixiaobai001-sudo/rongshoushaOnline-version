import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ============================================
// 全局错误捕获：任何未捕获的错误都显示在页面上
// ============================================
function showError(title: string, err: unknown) {
  console.error('❌ ' + title, err)
  const root = document.getElementById('root')
  if (!root) return
  const msg = err instanceof Error ? err.message + '\n\n' + (err.stack || '') : String(err)
  root.innerHTML = `
    <div style="color:white;background:#0f172a;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;font-family:monospace;">
      <h1 style="color:#ef4444;font-size:20px;margin-bottom:12px;">${title}</h1>
      <pre style="color:#94a3b8;font-size:12px;white-space:pre-wrap;word-break:break-all;max-width:100%;background:#1e293b;padding:16px;border-radius:8px;border:1px solid #334155;overflow:auto;">${msg}</pre>
      <button onclick="location.reload()" style="margin-top:16px;padding:10px 24px;background:#6366f1;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;">重新加载</button>
    </div>
  `
}

window.addEventListener('error', (event) => {
  showError('运行时错误', event.error || event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  showError('未处理的 Promise 错误', event.reason)
})

console.log('🎮 绒兽杀加载中...')

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (e) {
  showError('渲染错误', e)
}
