// ============================================================
// 线上验收烟测（部署后跑一遍，确认生产环境真的是新代码）
// 默认目标：https://m.transfur.com.cn
//   覆盖：6 位易读房间码 / 房间码大小写容错 / 房主离开清理房间 /
//         后台接口状态 / 旧口令失效 / 公开接口
// 用法：
//   node tests/线上验收烟测.mjs
//   TARGET_ORIGIN=http://127.0.0.1:3000 node tests/线上验收烟测.mjs
//   （可选）LEGACY_ADMIN_PASSWORD=xxx 指定要验证已失效的旧后台口令
// 说明：只创建/关闭一个私密房间 + 2 次后台登录探测，不动任何线上数据。
// ============================================================
import WebSocket from 'ws'

const ORIGIN = process.env.TARGET_ORIGIN || 'https://m.transfur.com.cn'
const WS_URL = ORIGIN.replace(/^http/, 'ws') + '/'
const LEGACY_ADMIN_PASSWORD = process.env.LEGACY_ADMIN_PASSWORD || ''
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

class Client {
  constructor(label) { this.label = label; this.messages = []; this.consumed = new Set() }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL)
      this.ws = ws
      ws.on('open', resolve)
      ws.on('error', reject)
      ws.on('message', (raw) => {
        try { this.messages.push(JSON.parse(raw.toString())) } catch { /* ignore */ }
      })
    })
  }
  send(o) { this.ws.send(JSON.stringify(o)) }
  async waitFor(pred, timeout = 5000) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      for (let i = 0; i < this.messages.length; i++) {
        if (this.consumed.has(i)) continue
        const m = this.messages[i]
        if (pred(m)) { this.consumed.add(i); return m }
      }
      await sleep(20)
    }
    throw new Error(`${this.label}: 超时，最后消息 ${JSON.stringify(this.messages.slice(-3))}`)
  }
  close() { try { this.ws.close() } catch { /* ignore */ } }
}

try {
  console.log(`\n目标：${ORIGIN}\n`)

  console.log('【1】服务端：6 位易读房间码（自动生成）')
  const A = new Client('A')
  await A.connect()
  A.send({ type: 'room_create', hostName: '烟测房主', isPublic: false })
  const created = await A.waitFor((m) => m.type === 'room_created')
  check('自动生成房间码', typeof created.roomId === 'string' && created.roomId.length > 0, JSON.stringify(created))
  check('房间码为 6 位', created.roomId.length === 6, created.roomId)
  check('房间码不含易混淆字符', /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(created.roomId), created.roomId)

  console.log('\n【2】服务端：房间码大小写/格式容错')
  const B = new Client('B')
  await B.connect()
  B.send({ type: 'room_join', roomId: created.roomId.toLowerCase(), playerName: '烟测玩家' })
  const joined = await B.waitFor((m) => m.type === 'room_joined')
  check('小写房间码也能加入', joined.roomId === created.roomId, `${joined.roomId} vs ${created.roomId}`)

  console.log('\n【3】服务端：房主离开清理房间')
  A.send({ type: 'room_leave' })
  let closed = null
  try { closed = await B.waitFor((m) => m.type === 'room_closed', 3000) } catch { /* ignore */ }
  check('房主离开后房间被关闭', !!closed)
  A.close(); B.close()

  console.log('\n【4】后台接口与旧口令')
  async function probe(password) {
    const res = await fetch(ORIGIN + '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    return res.status
  }
  const invalid = await probe('___not_a_password_' + Date.now() + '___')
  check('后台登录接口在线（401/429/503）', [401, 429, 503].includes(invalid), String(invalid))
  if (LEGACY_ADMIN_PASSWORD) {
    const legacy = await probe(LEGACY_ADMIN_PASSWORD)
    check('已泄露的旧口令不再能登录后台', legacy !== 200, `status=${legacy}`)
  } else {
    console.log('  ℹ️ 未设置 LEGACY_ADMIN_PASSWORD，跳过旧口令失效检查')
  }
  console.log(`  ℹ️ ADMIN_PASSWORD 环境变量：${invalid === 503
    ? '未配置（后台 503，游戏本体不受影响）'
    : `已配置（错误口令返回 ${invalid}）`}`)

  console.log('\n【5】公开接口')
  const ann = await fetch(ORIGIN + '/api/announcement')
  check('公告接口正常', ann.status === 200, String(ann.status))
  const rooms = await fetch(ORIGIN + '/api/rooms')
  check('房间列表接口正常', rooms.status === 200, String(rooms.status))
} catch (e) {
  fail++
  console.error('\n❌ 烟测异常：', e.message)
}

console.log(`\n${'='.repeat(50)}`)
console.log(`结果：${pass} 通过 / ${fail} 失败`)
console.log(`${'='.repeat(50)}\n`)
process.exit(fail === 0 ? 0 : 1)
