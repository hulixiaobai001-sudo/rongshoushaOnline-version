import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

console.log('🎮 绒兽杀加载中...')

try {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (e) {
  console.error('❌ 渲染错误:', e)
  document.getElementById('root')!.innerHTML = `
    <div style="color:white;background:#0f172a;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;font-family:sans-serif;">
      <h1 style="color:#ef4444;">加载失败</h1>
      <pre style="color:#94a3b8;font-size:12px;margin-top:12px;text-align:left;max-width:100%;overflow:auto;">${e instanceof Error ? e.message : '未知错误'}</pre>
    </div>
  `
}
