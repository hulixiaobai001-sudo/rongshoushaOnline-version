// ============================================================
// 浏览器端错误处理测试（真实启动 server + Edge headless + CDP）
// 目的：验证「全局错误不再把 React DOM 换掉」。
// 复现路径：
//   1. 页面正常挂载
//   2. 人为制造未捕获异常 / 未处理 Promise rejection
//   3. 断言：只出现悬浮错误提示面板；#root 仍是 React 管理的原 DOM
//   4. 再点一个按钮触发 React 状态更新 —— 如果 DOM 被换过，这里会抛
//      NotFoundError: Failed to execute 'removeChild' on 'Node'
// 运行：node tests/浏览器错误处理测试.mjs
// 依赖：Microsoft Edge（本机已装）；找不到就跳过并视为通过
// ============================================================
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APP_PORT = 32000 + Math.floor(Math.random() * 500)
const DEBUG_PORT = 9300 + Math.floor(Math.random() * 500)
const BASE = `http://127.0.0.1:${APP_PORT}/`

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]
const EDGE = EDGE_CANDIDATES.find(p => existsSync(p))

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.seq = 0
    this.pending = new Map()
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve)
      this.ws.once('error', reject)
    })
    this.ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (!msg.id) return
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error.message))
      else p.resolve(msg.result)
    })
  }
  send(method, params = {}, sessionId) {
    const id = ++this.seq
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    this.ws.send(JSON.stringify(payload))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }
  close() { try { this.ws.close() } catch { /* ignore */ } }
}

const children = []
const cleanup = () => {
  for (const c of children) { try { c.kill() } catch { /* ignore */ } }
}
process.on('exit', cleanup)

let exitCode = 1
try {
  if (!EDGE) {
    console.log('\n⚠️ 未找到 Edge/Chrome，跳过浏览器测试（视为通过）')
    pass++
    exitCode = 0
  } else {
    const server = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(APP_PORT), ADMIN_PASSWORD: 'browser-test-only' },
      stdio: 'ignore',
    })
    children.push(server)

    const userDataDir = path.join(os.tmpdir(), `rsx-edge-${Date.now()}`)
    const edge = spawn(EDGE, [
      '--headless=new',
      '--disable-gpu',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${userDataDir}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--window-size=900,700',
      'about:blank',
    ], { stdio: 'ignore' })
    children.push(edge)

    // 等服务 + 浏览器调试端口
    let version = null
    for (let i = 0; i < 150 && !version; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
        if (res.ok) version = await res.json()
      } catch { /* 还没起来 */ }
      if (!version) await delay(100)
    }
    if (!version) throw new Error('Edge 调试端口未就绪')

    const cdp = new CDP(version.webSocketDebuggerUrl)
    await cdp.connect()
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const evaluate = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true,
      }, sessionId)
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'evaluate 异常')
      return r.result.value
    }
    await cdp.send('Runtime.enable', {}, sessionId)
    await cdp.send('Page.enable', {}, sessionId)

    console.log('\n【1】页面能正常挂载')
    await cdp.send('Page.navigate', { url: BASE }, sessionId)
    let rootText = ''
    for (let i = 0; i < 100; i++) {
      try {
        rootText = await evaluate("(document.querySelector('#root') || {}).innerText || ''")
      } catch { /* 导航中 */ }
      if (rootText.includes('联机模式')) break
      await delay(100)
    }
    check('React 应用已挂载（出现「联机模式」按钮）', rootText.includes('联机模式'), rootText.slice(0, 120))
    check('没有错误提示面板', !(await evaluate("!!document.querySelector('[data-rs-error-panel]')")))

    console.log('\n【2】制造未捕获异常 / 未处理 rejection')
    await evaluate("setTimeout(() => { throw new Error('TEST_UNCAUGHT_ERROR') }, 0)")
    await evaluate("setTimeout(() => { Promise.reject(new Error('TEST_UNHANDLED_REJECTION')) }, 0)")
    await delay(800)

    const panelExists = await evaluate("!!document.querySelector('[data-rs-error-panel]')")
    check('出现非破坏性错误提示面板', panelExists === true)
    const panelText = await evaluate("(document.querySelector('[data-rs-error-panel]') || {}).innerText || ''")
    check('提示面板包含测试错误信息', panelText.includes('TEST_UNCAUGHT_ERROR'), panelText.slice(0, 200))
    check('提示面板包含未处理 rejection 信息', panelText.includes('TEST_UNHANDLED_REJECTION'), panelText.slice(0, 300))

    console.log('\n【3】React 管理的 DOM 没有被替换，仍能正常更新')
    const rootAfter = await evaluate("(document.querySelector('#root') || {}).innerText || ''")
    check('#root 仍是原 React 页面（没被错误页替换）', rootAfter.includes('联机模式'), rootAfter.slice(0, 120))
    const clicked = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').includes('联机模式'))
      if (!btn) return false
      btn.click()
      return true
    })()`)
    check('找到并点击了「联机模式」按钮', clicked === true)
    await delay(600)
    const hallText = await evaluate("(document.querySelector('#root') || {}).innerText || ''")
    check('点击后 React 正常切换到联机大厅', hallText.includes('创建房间'), hallText.slice(0, 160))

    // 更新之后再等一会，看是否有 removeChild 之类的新错误冒出来
    await delay(500)
    const panelText2 = await evaluate("(document.querySelector('[data-rs-error-panel]') || {}).innerText || ''")
    check('没有出现 removeChild / NotFoundError 崩溃', !/removeChild|NotFoundError|not a child of this node/i.test(panelText2), panelText2.slice(0, 400))

    console.log('\n【4】提示面板可关闭，不影响游戏继续操作')
    const closed = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('[data-rs-error-panel] button')].find(b => (b.textContent || '').includes('关闭'))
      if (!btn) return false
      btn.click()
      return true
    })()`)
    check('找到「关闭」按钮', closed === true)
    await delay(200)
    check('关闭后面板消失', !(await evaluate("!!document.querySelector('[data-rs-error-panel]')")))
    check('关闭后页面仍在联机大厅', (await evaluate("(document.querySelector('#root') || {}).innerText || ''")).includes('创建房间'))

    cdp.close()
    try { rmSync(userDataDir, { recursive: true, force: true }) } catch { /* ignore */ }
    exitCode = fail === 0 ? 0 : 1
  }
} catch (e) {
  fail++
  console.error('\n❌ 浏览器测试异常：', e.message)
} finally {
  cleanup()
}

console.log(`\n${'='.repeat(50)}`)
console.log(`结果：${pass} 通过 / ${fail} 失败`)
console.log(`${'='.repeat(50)}\n`)
process.exit(exitCode)
