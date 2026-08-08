import { WebSocketServer } from 'ws';
import { createGame, serializeGame, nextPhase, movePlayer, useSkill, submitVotes } from './gameEngine.js';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';

// ============================================
// 配置
// ============================================
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = join(import.meta.dirname, '..', 'dist');

// ============================================
// 房间数据存储（内存）
// ============================================
const rooms = new Map(); // roomId -> { hostId, hostName, playerCount, maxPlayers, isPublic, hasPassword, createdAt, updatedAt }
const roomHistory = [];   // 对局历史（创建/结束记录）
const adminTokens = new Map(); // token -> expiry
const ADMIN_PASSWORD = '柯基不爱喝茶';
let announcement = '';    // 前台公告

function verifyAdmin(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const expiry = adminTokens.get(token);
  if (!expiry || Date.now() > expiry) return false;
  return true;
}

function recordHistory(room) {
  roomHistory.push({
    roomId: room.roomId,
    hostName: room.hostName,
    playerCount: room.playerCount,
    maxPlayers: room.maxPlayers,
    isPublic: room.isPublic,
    startedAt: room.createdAt,
    endedAt: Date.now(),
  });
  if (roomHistory.length > 200) roomHistory.shift();
}

function generateId(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let id = '';
  for (let i = 0; i < len; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function cleanupExpiredRooms() {
  const now = Date.now();
  const EXPIRY = 1000 * 45; // 45秒无心跳自动清除（3次心跳间隔）
  rooms.forEach((room, roomId) => {
    if (now - room.updatedAt > EXPIRY) {
      rooms.delete(roomId);
    }
  });
}

setInterval(cleanupExpiredRooms, 1000 * 60 * 5);

// ============================================
// HTTP 服务器 - 托管前端静态文件 + API
// ============================================
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // ===== API 路由 =====
  if (url.pathname.startsWith('/api/')) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ===== 管理后台 API =====
    // 后台登录
    if (url.pathname === '/api/admin/login' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.password === ADMIN_PASSWORD) {
            const token = generateId(24);
            adminTokens.set(token, Date.now() + 1000 * 60 * 60 * 8); // 8小时
            sendJson(res, 200, { ok: true, token });
          } else {
            sendJson(res, 401, { ok: false, error: '密码错误' });
          }
        } catch (e) {
          sendJson(res, 400, { ok: false, error: '格式错误' });
        }
      });
      return;
    }

    // 后台：所有房间（含私密）
    if (url.pathname === '/api/admin/rooms' && req.method === 'GET') {
      if (!verifyAdmin(req)) { sendJson(res, 401, { ok: false, error: '未授权' }); return; }
      // 读取真实活跃房间（gameRooms：WS房间系统）
      const now = Date.now();
      const list = [...gameRooms.values()].sort((a, b) => (b.hostWs?.createdAt || 0) - (a.hostWs?.createdAt || 0)).map(r => ({
        roomId: r.roomId,
        hostName: r.hostName,
        playerCount: r.players.size + 1, // 房主 + 玩家
        maxPlayers: r.maxPlayers,
        hasPassword: !!r.hasPassword,
        createdAt: r.hostWs?.createdAt || now,
      }));
      sendJson(res, 200, { ok: true, rooms: list });
      return;
    }

    // 后台：对局历史
    if (url.pathname === '/api/admin/history' && req.method === 'GET') {
      if (!verifyAdmin(req)) { sendJson(res, 401, { ok: false, error: '未授权' }); return; }
      const list = roomHistory.slice(-100).reverse();
      sendJson(res, 200, { ok: true, history: list });
      return;
    }

    // 后台：统计
    if (url.pathname === '/api/admin/stats' && req.method === 'GET') {
      if (!verifyAdmin(req)) { sendJson(res, 401, { ok: false, error: '未授权' }); return; }
      const now = Date.now();
      const totalPlayers = [...gameRooms.values()].reduce((s, r) => s + r.players.size + 1, 0);
      sendJson(res, 200, { ok: true, stats: {
        activeRooms: gameRooms.size,
        totalPlayers,
        totalGames: roomHistory.length,
        last24hGames: roomHistory.filter(h => now - h.startedAt < 86400000).length,
        announcement,
      }});
      return;
    }

    // 公告：读取（公开）
    if (url.pathname === '/api/announcement' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, announcement });
      return;
    }

    // 公告：设置（后台）
    if (url.pathname === '/api/admin/announcement' && req.method === 'POST') {
      if (!verifyAdmin(req)) { sendJson(res, 401, { ok: false, error: '未授权' }); return; }
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          announcement = String(data.text || '').slice(0, 200);
          sendJson(res, 200, { ok: true, announcement });
        } catch (e) {
          sendJson(res, 400, { ok: false, error: '格式错误' });
        }
      });
      return;
    }

    // 获取公开房间列表
    if (url.pathname === '/api/rooms' && req.method === 'GET') {
      const list = [...rooms.values()]
        .filter(r => r.isPublic)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(r => ({
          roomId: r.roomId,
          hostName: r.hostName,
          playerCount: r.playerCount,
          maxPlayers: r.maxPlayers,
          hasPassword: !!r.hasPassword,
          createdAt: r.createdAt,
        }));
      sendJson(res, 200, { ok: true, rooms: list });
      return;
    }

    // 注册房间
    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const roomId = (data.roomId || '').trim();
          if (!roomId) { sendJson(res, 400, { ok: false, error: '缺少房间码' }); return; }
          if (rooms.has(roomId)) { sendJson(res, 409, { ok: false, error: '房间码已存在' }); return; }
          const now = Date.now();
          rooms.set(roomId, {
            roomId,
            hostId: data.hostId || '',
            hostName: (data.hostName || '房主').slice(0, 20),
            playerCount: Number(data.playerCount) || 1,
            maxPlayers: Number(data.maxPlayers) || 8,
            isPublic: !!data.isPublic,
            hasPassword: !!data.hasPassword,
            createdAt: now,
            updatedAt: now,
          });
          sendJson(res, 200, { ok: true });
        } catch (e) {
          sendJson(res, 400, { ok: false, error: '格式错误' });
        }
      });
      return;
    }

    // 更新房间 / 注销房间
    if (url.pathname.startsWith('/api/rooms/')) {
      const roomId = decodeURIComponent(url.pathname.slice('/api/rooms/'.length));
      const room = rooms.get(roomId);

      if (req.method === 'DELETE') {
        const rm = rooms.get(roomId);
        if (rm) recordHistory(rm);
        rooms.delete(roomId);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'PUT') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (!room) { sendJson(res, 404, { ok: false, error: '房间不存在' }); return; }
            if (typeof data.playerCount === 'number') room.playerCount = data.playerCount;
            if (typeof data.hostName === 'string') room.hostName = data.hostName.slice(0, 20);
            room.updatedAt = Date.now();
            sendJson(res, 200, { ok: true });
          } catch (e) {
            sendJson(res, 400, { ok: false, error: '格式错误' });
          }
        });
        return;
      }
    }

    sendJson(res, 404, { ok: false, error: '接口不存在' });
    return;
  }

  // ===== 静态文件托管 =====
  let path = url.pathname;
  if (path === '/') path = '/index.html';
  // 兼容 base path
  if (path.startsWith('/rongshoushaOnline-version')) {
    path = path.slice('/rongshoushaOnline-version'.length) || '/index.html';
  }

  const filePath = join(PUBLIC_DIR, path);
  if (existsSync(filePath)) {
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(readFileSync(filePath));
  } else {
    // SPA 回退
    const indexFile = join(PUBLIC_DIR, 'index.html');
    if (existsSync(indexFile)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(indexFile));
    } else {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('前端尚未构建，请先运行 npm run build');
    }
  }
});

// ============================================
// WebSocket 服务器 - 房间成员管理 + 消息路由
// ============================================
const wss = new WebSocketServer({ server: httpServer });
const gameRooms = new Map(); // roomId -> { hostWs, hostId, hostName, players: Map<playerId, {ws, name}>, public, maxPlayers, hasPassword }

function broadcastRoomList() {
  const list = [...rooms.values()]
    .filter(r => r.isPublic)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(r => ({
      roomId: r.roomId,
      hostName: r.hostName,
      playerCount: r.playerCount,
      maxPlayers: r.maxPlayers,
      hasPassword: !!r.hasPassword,
      createdAt: r.createdAt,
    }));
  const msg = JSON.stringify({ type: 'room_list', rooms: list });
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

function wsSend(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function syncRoomListToRoom(room) {
  // 更新房间列表人数（gameRooms → rooms 注册表）
  if (rooms.has(room.roomId)) {
    const r = rooms.get(room.roomId);
    r.playerCount = room.players.size + 1; // +房主
    r.updatedAt = Date.now();
  }
  broadcastRoomList();
}

function memberList(room) {
  const list = [{ id: room.hostId, name: room.hostName, isHost: true }];
  room.players.forEach((p, pid) => {
    list.push({ id: pid, name: p.name, isHost: false });
  });
  return list;
}

wss.on('connection', (ws) => {
  broadcastRoomList();
  ws.playerId = null;
  ws.roomId = null;
  ws.isHost = false;
  ws.playerName = '';

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {
      // ===== 房间管理 =====
      case 'room_create': {
        const roomId = String(msg.roomId || '').trim() || 'room_' + Math.random().toString(36).slice(2, 8);
        if (gameRooms.has(roomId)) {
          wsSend(ws, { type: 'error', message: '房间码已存在' });
          return;
        }
        const playerId = 'p_' + Math.random().toString(36).slice(2, 8);
        ws.playerId = playerId;
        ws.roomId = roomId;
        ws.isHost = true;
        ws.playerName = String(msg.hostName || '房主').slice(0, 20);
        gameRooms.set(roomId, {
          roomId,
          hostWs: ws,
          hostId: playerId,
          hostName: ws.playerName,
          players: new Map(),
          maxPlayers: Number(msg.maxPlayers) || 8,
          hasPassword: !!msg.hasPassword,
          game: null,          // 游戏状态（服务器权威）
          readySet: new Set(), // 已准备玩家
          votes: [],           // 投票收集
          gameStarted: false,
        });
        // 同步到公开房间注册表
        if (!rooms.has(roomId)) {
          rooms.set(roomId, {
            roomId,
            hostId: playerId,
            hostName: ws.playerName,
            playerCount: 1,
            maxPlayers: Number(msg.maxPlayers) || 8,
            isPublic: !!msg.isPublic,
            hasPassword: !!msg.hasPassword,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
        broadcastRoomList();
        wsSend(ws, { type: 'room_created', roomId, playerId, isHost: true });
        break;
      }

      case 'room_join': {
        const roomId = String(msg.roomId || '').trim();
        const room = gameRooms.get(roomId);
        if (!room) {
          wsSend(ws, { type: 'error', message: '房间不存在' });
          return;
        }
        if (room.players.size + 1 >= room.maxPlayers) {
          wsSend(ws, { type: 'error', message: '房间已满' });
          return;
        }
        const playerId = 'p_' + Math.random().toString(36).slice(2, 8);
        const name = String(msg.playerName || '玩家').slice(0, 20);
        const isSpectator = !!msg.isSpectator;
        ws.playerId = playerId;
        ws.roomId = roomId;
        ws.isHost = false;
        ws.playerName = name;
        room.players.set(playerId, { ws, name, isSpectator });
        // 通知房主
        wsSend(room.hostWs, { type: 'player_joined', playerId, name, isSpectator });
        // 通知玩家自己
        wsSend(ws, { type: 'room_joined', roomId, playerId, isHost: false, isSpectator, players: memberList(room) });
        // 通知其他玩家
        room.players.forEach((p, pid) => {
          if (pid !== playerId) wsSend(p.ws, { type: 'player_joined', playerId, name, isSpectator });
        });
        syncRoomListToRoom(room);
        break;
      }

      case 'room_leave': {
        const room = gameRooms.get(ws.roomId);
        if (!room) return;
        if (ws.isHost) {
          // 房主离开 → 解散房间
          room.players.forEach((p) => wsSend(p.ws, { type: 'room_closed', message: '房主已离开' }));
          rooms.delete(room.roomId);
          const rm = rooms.get(room.roomId);
          if (rm) { recordHistory(rm); rooms.delete(room.roomId); }
          gameRooms.delete(room.roomId);
        } else if (ws.playerId) {
          room.players.delete(ws.playerId);
          room.players.forEach((p) => wsSend(p.ws, { type: 'player_left', playerId: ws.playerId, name: ws.playerName }));
          wsSend(room.hostWs, { type: 'player_left', playerId: ws.playerId, name: ws.playerName });
          syncRoomListToRoom(room);
        }
        break;
      }

      // ===== 消息路由 =====
      case 'to_host': {
        // 玩家 → 房主
        const room = gameRooms.get(ws.roomId);
        if (room && !ws.isHost && ws.playerId) {
          wsSend(room.hostWs, { type: 'from_player', playerId: ws.playerId, name: ws.playerName, data: msg.data });
        }
        break;
      }

      case 'to_players': {
        // 房主 → 所有玩家
        const room = gameRooms.get(ws.roomId);
        if (room && ws.isHost) {
          room.players.forEach((p) => wsSend(p.ws, { type: 'from_host', data: msg.data }));
        }
        break;
      }

      case 'to_peer': {
        // 房主 → 指定玩家
        const room = gameRooms.get(ws.roomId);
        if (room && ws.isHost && msg.peerId) {
          const target = room.players.get(msg.peerId);
          if (target) wsSend(target.ws, { type: 'from_host', data: msg.data });
        }
        break;
      }

      // ===== 游戏（服务器权威） =====
      case 'game_start': {
        // 房主开始游戏
        const room = gameRooms.get(ws.roomId);
        if (!room || !ws.isHost || room.gameStarted) return;
        // 玩家名单：房主 + 已加入玩家
        const names = [ws.playerName];
        room.players.forEach((p) => names.push(p.name));
        // 房主配置（人数设置）简化：杀手数 = 房主设置的或默认
        room.game = createGame({
          hostName: ws.playerName,
          players: names,
          killerCount: 0, // 默认动态
        });
        // 建立 serverId ↔ gamePlayerId 映射（房主=players[0]）
        room.gamePlayerMap = new Map();
        room.gamePlayerMap.set(ws.playerId, room.game.players[0].id);
        let gi = 1;
        room.players.forEach((p, serverId) => {
          if (room.game.players[gi]) room.gamePlayerMap.set(serverId, room.game.players[gi].id);
          gi++;
        });
        room.gameStarted = true;
        // 私发身份给每个玩家
        room.game.players.forEach((gp, i) => {
          if (i === 0) return; // 房主自己知道（room.hostWs）
          const serverId = [...room.players.keys()][i - 1];
          if (serverId) {
            wsSend(room.players.get(serverId).ws, {
              type: 'from_host', data: { type: 'your_role', playerId: gp.id, identity: gp.identity, heroId: gp.heroId },
            });
          }
        });
        // 广播初始状态
        const initState = serializeGame(room.game, null);
        room.players.forEach((p) => wsSend(p.ws, { type: 'from_host', data: { type: 'game_init', state: initState } }));
        wsSend(room.hostWs, { type: 'game_started' });
        break;
      }

      case 'game_action': {
        const room = gameRooms.get(ws.roomId);
        if (!room || !room.game) return;
        const d = msg.data || {};
        const action = d.action;
        const payload = d.data || {};
        const game = room.game;

        // 玩家身份：用映射
        const myGamePlayerId = room.gamePlayerMap ? room.gamePlayerMap.get(ws.playerId) : null;
        if (!myGamePlayerId) return;

        switch (action) {
          case 'move': {
            movePlayer(game, payload.playerId || myGamePlayerId, payload.locationId);
            break;
          }
          case 'attack': {
            useSkill(game, myGamePlayerId, 'basic_kill', payload.targetId);
            break;
          }
          case 'skill': {
            const result = useSkill(game, myGamePlayerId, payload.skillId, payload.targetId, payload.targetLocationId);
            if (result && result.reveal) {
              // 探查结果私发
              wsSend(ws, { type: 'from_host', data: {
                type: 'private_info',
                text: `【查验】${game.players.find(x => x.id === result.reveal.targetId)?.name} 的身份是：${result.reveal.identity === 'killer' ? '杀手' : '平民'}`,
              }});
            }
            break;
          }
          case 'vote': {
            if (payload.targetId) {
              room.votes.push({ voterId: myGamePlayerId, targetId: payload.targetId });
            }
            break;
          }
          case 'ready': {
            room.readySet.add(myGamePlayerId);
            break;
          }
          case 'next': {
            // 房主推进（或全部就绪自动推进）
            if (ws.isHost) {
              room.readySet = new Set();
              room.votes = [];
              nextPhase(game);
            }
            break;
          }
          default: break;
        }

        // 全部存活就绪 → 自动推进
        const aliveIds = game.players.filter(p => p.status === 'alive').map(p => p.id);
        const allReady = aliveIds.length > 0 && aliveIds.every(id => room.readySet.has(id));
        if (allReady) {
          room.readySet = new Set();
          if (game.phase === 'vote') {
            submitVotes(game, room.votes);
            room.votes = [];
            nextPhase(game);
          } else {
            nextPhase(game);
          }
        }

        // 广播状态
        const state = serializeGame(game, null);
        room.players.forEach((p) => wsSend(p.ws, { type: 'from_host', data: { type: 'sync', state } }));
        wsSend(room.hostWs, { type: 'from_host', data: { type: 'sync', state } });
        break;
      }

      case 'room_list_request':
        broadcastRoomList();
        break;

      case 'room_register':
        if (msg.roomId && !rooms.has(msg.roomId)) {
          const now = Date.now();
          rooms.set(msg.roomId, {
            roomId: msg.roomId,
            hostId: msg.hostId || '',
            hostName: (msg.hostName || '房主').slice(0, 20),
            playerCount: Number(msg.playerCount) || 1,
            maxPlayers: Number(msg.maxPlayers) || 8,
            isPublic: !!msg.isPublic,
            hasPassword: !!msg.hasPassword,
            createdAt: now,
            updatedAt: now,
          });
          broadcastRoomList();
        }
        break;

      case 'room_update':
        if (rooms.has(msg.roomId)) {
          const room = rooms.get(msg.roomId);
          if (typeof msg.playerCount === 'number') room.playerCount = msg.playerCount;
          room.updatedAt = Date.now();
          broadcastRoomList();
        }
        break;

      case 'room_unregister':
        rooms.delete(msg.roomId);
        broadcastRoomList();
        break;

      default:
        break;
    }
  });

  ws.on('close', () => {
    // 断开连接时清理房间
    const room = gameRooms.get(ws.roomId);
    if (room) {
      if (ws.isHost) {
        room.players.forEach((p) => wsSend(p.ws, { type: 'room_closed', message: '房主已断开连接' }));
        gameRooms.delete(room.roomId);
      } else if (ws.playerId) {
        room.players.delete(ws.playerId);
        room.players.forEach((p) => wsSend(p.ws, { type: 'player_left', playerId: ws.playerId, name: ws.playerName }));
        wsSend(room.hostWs, { type: 'player_left', playerId: ws.playerId, name: ws.playerName });
        syncRoomListToRoom(room);
      }
    }
    broadcastRoomList();
  });
});

// ============================================
// 启动
// ============================================
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🎮 绒兽杀在线版服务器`);
  console.log(`  ─────────────────────`);
  console.log(`  🌐 网页: http://localhost:${PORT}`);
  console.log(`  📡 WebSocket: ws://localhost:${PORT}`);
  console.log(`  📱 线上: 由 Railway 自动分配地址\n`);
});
