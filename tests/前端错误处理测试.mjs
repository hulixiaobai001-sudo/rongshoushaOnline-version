// ============================================================
// 前端错误处理回归检查（静态源码断言）
// 背景：线上曾出现——
//   NotFoundError: Failed to execute 'removeChild' on 'Node':
//   The node to be removed is not a child of this node.
// 根因：main.tsx 在全局 error 处理器里执行 root.innerHTML = '<错误页>'，
// 把 React 管理的 DOM 整个替换掉；下一次渲染/卸载必然 removeChild 失败。
// 这个测试用静态断言守住几条红线，防止同类写法回归。
// 运行：node tests/前端错误处理测试.mjs
// ============================================================
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8')
// 去掉注释再断言（注释里允许引用"曾经这么写过"的反例，不算违规代码）
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

console.log('\n【1】main.tsx 不再破坏 React 管理的 DOM');
{
  const main = stripComments(read('src/main.tsx'))
  check('main.tsx 存在', true)
  check('没有 root.innerHTML 赋值', !/\.innerHTML\s*=/.test(main), '发现 innerHTML 赋值')
  check('没有 document.getElementById(\'root\').innerHTML', !/getElementById\(['"]root['"]\)\s*\.innerHTML/.test(main))
  check('引入了 ErrorBoundary', /import\s+\{\s*ErrorBoundary\s*\}/.test(main))
  check('使用了 ErrorBoundary 包裹 App', /<ErrorBoundary>[\s\S]*<App\s*\/?>/.test(main))
  check('安装了全局错误兜底', /installGlobalErrorHandlers\(\)/.test(main))
}

console.log('\n【2】errorReporter 只做非破坏性提示');
{
  const p = 'src/lib/errorReporter.ts'
  check('errorReporter.ts 存在', existsSync(path.join(ROOT, p)))
  const src = stripComments(read(p))
  check('不写 innerHTML', !/\.innerHTML\s*=/.test(src))
  check('用 textContent 写入错误文本（防注入）', /textContent\s*=/.test(src))
  check('面板 append 到 document.body（不碰 #root）', /document\.body\.appendChild/.test(src))
  check('对 ResizeObserver 噪声有忽略规则', /ResizeObserver/.test(src))
  check('reportError 自身包在 try/catch 里', /try\s*\{[\s\S]*console\.error[\s\S]*\}\s*catch/.test(src))
}

console.log('\n【3】ErrorBoundary 存在且能接住渲染错误');
{
  const p = 'src/components/ErrorBoundary.tsx'
  check('ErrorBoundary.tsx 存在', existsSync(path.join(ROOT, p)))
  const src = read(p)
  check('实现了 getDerivedStateFromError', /getDerivedStateFromError/.test(src))
  check('实现了 componentDidCatch（记录日志）', /componentDidCatch/.test(src))
  check('fallback 提供重新加载按钮', /重新加载/.test(src))
}

console.log('\n【4】复制房间码不再裸调 clipboard');
{
  const src = read('src/network/Lobby.tsx')
  check('没有裸调 navigator.clipboard.writeText(roomCode)', !/navigator\.clipboard\.writeText\(roomCode\)\s*$/m.test(src))
  check('检查了 clipboard 是否存在', /navigator\.clipboard\s*&&/.test(src))
  check('有 execCommand 降级分支', /execCommand\(['"]copy['"]\)/.test(src))
  check('复制失败有兜底提示（不再抛错）', /复制失败，请手动记下房间码/.test(src))
}

console.log('\n【5】localStorage 访问有安全封装');
{
  const helper = read('src/lib/safeStorage.ts')
  check('safeStorage 提供 get/set/remove', ['storageGet', 'storageSet', 'storageRemove'].every(f => new RegExp(`export function ${f}`).test(helper)))
  check('每个函数都有 try/catch', (helper.match(/try\s*\{/g) || []).length >= 3)
  const online = read('src/network/OnlineGame.tsx')
  check('OnlineGame 的记录本不再裸用 localStorage', !/localStorage\.(getItem|setItem)\(['"]rongshousha_notes/.test(online))
  check('OnlineGame 使用 safeStorage', /storageGet/.test(online) && /storageSet/.test(online))
}

console.log('\n【6】禁止浏览器自动翻译（防翻译破坏 React DOM）');
{
  const html = read('index.html')
  check('index.html 带 google notranslate', /name="google"\s+content="notranslate"/.test(html))
  check('html 标签带 translate="no"', /translate="no"/.test(html))
}

console.log(`\n${'='.repeat(50)}`)
console.log(`结果：${pass} 通过 / ${fail} 失败`)
console.log(`${'='.repeat(50)}\n`)
process.exit(fail === 0 ? 0 : 1)
