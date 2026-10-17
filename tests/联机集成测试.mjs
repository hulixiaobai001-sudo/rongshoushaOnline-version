// ============================================================
// 联机集成测试：真实启动 server/index.js，用 WebSocket 客户端走完整流程
// 覆盖：
//   1. 6 位易读房间码（自动生成）
//   2. 开局 / 身份下发
//   3. 断线不再卡死整局（掉线玩家不参与就绪判定）
//   4. 移动反馈 toast + 移动次数限制（服务端权威）
//   5. 房主 next 不会连推两个阶段
//   6. 断线重连：恢复角色 + 重新参与就绪判定
// 运行：node tests/联机集成测试.mjs
// ============================================================
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 39000 + Math.floor(Math.random() * 900);
const BASE = `ws://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

class Client {
  constructor(label) {
    this.label = label;
    this.ws = null;
    this.messages = [];
    this.consumed = new Set();
  }
  async connect(retries = 60) {
    for (let i = 0; i < retries; i++) {
      try {
        await new Promise((resolve, reject) => {
          const ws = new WebSocket(BASE);
          this.ws = ws;
          ws.on('open', resolve);
          ws.on('error', reject);
          ws.on('message', (raw) => {
            try { this.messages.push(JSON.parse(raw.toString())); } catch { /* ignore */ }
          });
        });
        return;
      } catch {
        this.ws = null;
        await delay(100);
      }
    }
    throw new Error(`${this.label}: 无法连接测试服务器 ${BASE}`);
  }
  send(obj) { this.ws.send(JSON.stringify(obj)); }
  async waitFor(pred, timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      for (let i = 0; i < this.messages.length; i++) {
        if (this.consumed.has(i)) continue;
        const m = this.messages[i];
        if (pred(m)) { this.consumed.add(i); return m; }
      }
      await delay(15);
    }
    throw new Error(`${this.label}: 等待消息超时（最后 ${this.messages.length} 条）: ${JSON.stringify(this.messages.slice(-4))}`);
  }
  /** 等待 from_host 下内层 type 的消息，返回内层 data */
  async waitHost(innerType, timeout = 5000) {
    const m = await this.waitFor(
      (x) => x.type === 'from_host' && x.data && x.data.type === innerType,
      timeout,
    );
    return m.data;
  }
  close() { try { this.ws && this.ws.close(); } catch { /* ignore */ } }
}

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), ADMIN_PASSWORD: 'integration-test-only-password' },
  stdio: 'ignore',
});
const cleanup = () => { try { server.kill(); } catch { /* ignore */ } };
process.on('exit', cleanup);

const clients = [];
try {
  // ============================================================
  console.log('\n【0】房间码：留空自动生成 6 位易读码');
  {
    const C = new Client('C');
    clients.push(C);
    await C.connect();
    C.send({ type: 'room_create', hostName: '测试C', isPublic: true });
    const created = await C.waitFor((m) => m.type === 'room_created');
    const code = created.roomId;
    check('自动生成了房间码', !!code, JSON.stringify(created));
    check('房间码是 6 位', typeof code === 'string' && code.length === 6, code);
    check('房间码不含易混淆字符（0/O/1/I/L）', /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code), code);
    C.send({ type: 'room_leave' });
    C.close();
  }

  // ============================================================
  console.log('\n【1】创建 / 加入 / 开局');
  const A = new Client('A'), B = new Client('B');
  clients.push(A, B);
  await A.connect();
  A.send({ type: 'room_create', roomId: 'TEST01', hostName: '房主A', isPublic: true });
  const created = await A.waitFor((m) => m.type === 'room_created');
  check('房主创建房间 TEST01', created.roomId === 'TEST01', JSON.stringify(created));

  await B.connect();
  B.send({ type: 'room_join', roomId: 'test-01', playerName: '玩家B' }); // 小写+连字符也应能进
  const joined = await B.waitFor((m) => m.type === 'room_joined');
  check('玩家用规范化房间码加入（test-01 → TEST01）', joined.roomId === 'TEST01', JSON.stringify(joined));
  await A.waitFor((m) => m.type === 'player_joined');

  A.send({ type: 'game_start' });
  const aInit = await A.waitHost('game_init');
  const bRole = await B.waitHost('your_role');
  const bInit = await B.waitHost('game_init');
  check('房主收到 game_init', !!aInit.state, '');
  check('玩家收到 your_role（自己身份）', !!bRole.playerId && ['killer', 'civilian'].includes(bRole.identity), JSON.stringify(bRole));
  check('开局阶段 = action1', aInit.state.phase === 'action1', aInit.state.phase);
  check('双方初始状态一致（玩家数 2）', aInit.state.players.length === 2 && bInit.state.players.length === 2, '');
  const meId = aInit.state.players[0].id;      // 房主
  const bId = bRole.playerId;                   // 玩家B
  check('房主视角只暴露自己的身份', aInit.state.players.find(p => p.id === bId)?.identity === undefined, '');

  // ============================================================
  console.log('\n【2】断线不卡死：B 掉线后，A 一个人 ready 就能推进');
  B.close();
  await A.waitFor((m) => m.type === 'from_host' && m.data?.type === 'toast' && String(m.data.text).includes('掉线'));
  A.send({ type: 'game_action', action: 'ready', data: {} });
  const syncAfterDrop = await A.waitHost('sync');
  check('B 掉线后 A 就绪即推进到 move1', syncAfterDrop.state.phase === 'move1', syncAfterDrop.state.phase);

  // ============================================================
  console.log('\n【3】移动：服务端权威次数限制 + toast 反馈');
  {
    const st = syncAfterDrop.state;
    const me = st.players.find(p => p.id === meId);
    const cur = st.locations.find(l => l.id === me.locationId);
    const neighbors = (cur.connectedTo || [])
      .map(id => st.locations.find(l => l.id === id))
      .filter(l => l && !l.isBlocked);
    check('当前地点至少有一个可去邻地', neighbors.length > 0, JSON.stringify(cur));
    const first = neighbors[0];
    const second = neighbors[1] || neighbors[0];

    A.send({ type: 'game_action', action: 'move', data: { locationId: first.id } });
    const toastOk = await A.waitHost('toast');
    check('移动成功收到 toast', String(toastOk.text).includes('已移动到'), JSON.stringify(toastOk));
    check('toast 等级 success', toastOk.level === 'success', toastOk.level);
    const sync1 = await A.waitHost('sync');
    check('第一次移动后位置已更新', sync1.state.players.find(p => p.id === meId)?.locationId === first.id, '');

    A.send({ type: 'game_action', action: 'move', data: { locationId: second.id } });
    const toastErr = await A.waitHost('toast');
    check('同一阶段第二次移动被服务端拒绝', String(toastErr.text).includes('本阶段已移动'), JSON.stringify(toastErr));

    const syncMove = await A.waitHost('sync');
    const meAfter = syncMove.state.players.find(p => p.id === meId);
    check('最终位置 = 第一次移动的目标', meAfter.locationId === first.id, `${meAfter.locationId} vs ${first.id}`);
    check('服务端标记已移动（movedThisPhase）', meAfter.movedThisPhase === true, String(meAfter.movedThisPhase));
  }

  // ============================================================
  console.log('\n【4】房主 next 不会一次推两个阶段');
  A.send({ type: 'game_action', action: 'next', data: {} });
  const syncNext = await A.waitHost('sync');
  check('move1 后只推进到 action2（不是 move2）', syncNext.state.phase === 'action2', syncNext.state.phase);

  // ============================================================
  console.log('\n【5】断线重连：恢复角色并重新参与就绪判定');
  const B2 = new Client('B2');
  clients.push(B2);
  await B2.connect();
  B2.send({ type: 'room_join', roomId: 'TEST01', playerName: '玩家B' });
  const rejoined = await B2.waitFor((m) => m.type === 'room_joined');
  check('重连成功加入房间', rejoined.roomId === 'TEST01', JSON.stringify(rejoined));
  const reToast = await B2.waitHost('toast');
  check('重连收到提示', String(reToast.text).includes('重新连接'), JSON.stringify(reToast));
  const bInit2 = await B2.waitHost('game_init');
  const bMe = bInit2.state.players.find(p => p.id === bId);
  check('重连拿回原角色（身份仍可见）', !!bMe && ['killer', 'civilian'].includes(bMe.identity), JSON.stringify(bMe));

  A.send({ type: 'game_action', action: 'ready', data: {} });
  const syncA1 = await A.waitHost('sync');
  check('B 重连但未就绪时不会推进', syncA1.state.phase === 'action2', syncA1.state.phase);

  B2.send({ type: 'game_action', action: 'ready', data: {} });
  const syncA2 = await A.waitHost('sync');
  check('A+B 都就绪后推进到 move2', syncA2.state.phase === 'move2', syncA2.state.phase);

  A.close(); B2.close();
} catch (e) {
  fail++;
  console.error('\n❌ 测试异常：', e.message);
} finally {
  clients.forEach(c => c.close());
  cleanup();
}

console.log(`\n${'='.repeat(50)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
console.log(`${'='.repeat(50)}\n`);
process.exit(fail === 0 ? 0 : 1);
