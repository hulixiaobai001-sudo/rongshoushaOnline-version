import WebSocket from 'ws';
import { spawn } from 'child_process';
import { join } from 'path';

const PORT = 18123;
// 启动服务器子进程（避免与当前进程的 import 副作用冲突）
const proc = spawn('node', [join(process.cwd(), 'index.js')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise(r => setTimeout(r, 1500));

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/`);
    ws.name = name;
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'room_created' || msg.type === 'room_joined') {
        ws.messages = ws.messages || [];
        ws.roomId = msg.roomId; ws.playerId = msg.playerId;
      }
    });
  });
}

function waitMsg(ws, type, timeout = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeout);
    ws.on('message', function handler(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) { clearTimeout(timer); ws.off('message', handler); resolve(msg); }
    });
  });
}

// 收集房主的所有 from_host 消息
function collectHost(ws) {
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    ws.messages = ws.messages || [];
    ws.messages.push(msg);
  });
}

let pass = 0, fail = 0;
function T(name, cond, extra='') { if (cond) { pass++; console.log('✅', name); } else { fail++; console.log('❌', name, extra); } }

try {
  const host = await connect('房主');
  host.send(JSON.stringify({ type: 'room_create', hostName: '房主', isPublic: false }));
  await waitMsg(host, 'room_created');
  console.log('房主建房 OK, roomId =', host.roomId);
  collectHost(host);

  const player = await connect('玩家A');
  player.send(JSON.stringify({ type: 'room_join', roomId: host.roomId, playerName: '玩家A', isSpectator: false }));
  const joined = await waitMsg(player, 'room_joined');
  T('玩家加入成功', !!joined && joined.playerId === player.playerId, JSON.stringify(joined));

  // 房主应收到 player_joined
  const pj = await waitMsg(host, 'player_joined');
  T('房主收到player_joined', !!pj && pj.name === '玩家A', JSON.stringify(pj));

  // 房主开始游戏
  host.send(JSON.stringify({ type: 'game_start' }));
  // 房主应收到 game_init
  const initMsg = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 3000);
    host.on('message', function handler(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'from_host' && msg.data && msg.data.type === 'game_init') {
        clearTimeout(timer); host.off('message', handler); resolve(msg);
      }
    });
  });

  if (initMsg) {
    const state = initMsg.data.state;
    const names = state.players.map(p => p.name);
    T('房主看到玩家列表', names.includes('房主') && names.includes('玩家A'), 'players=' + JSON.stringify(names));
    T('玩家数=2', state.players.length === 2, 'length=' + state.players.length);
    console.log('房主视角玩家:', JSON.stringify(names));
  } else {
    T('房主收到game_init', false, '超时未收到');
  }

  // 玩家侧也应收到 game_init 且能看到房主
  const pInit = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 3000);
    player.on('message', function handler(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'from_host' && msg.data && msg.data.type === 'game_init') {
        clearTimeout(timer); player.off('message', handler); resolve(msg);
      }
    });
  });
  if (pInit) {
    const names = pInit.data.state.players.map(p => p.name);
    T('玩家侧看到房主+自己', names.includes('房主') && names.includes('玩家A'), 'players=' + JSON.stringify(names));
  } else {
    T('玩家侧收到game_init', false, '超时');
  }
} catch (e) {
  console.log('❌ 测试异常:', e.message);
  fail++;
} finally {
  proc.kill();
  console.log(`\n===== 集成测试: ${pass} 通过, ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
}
