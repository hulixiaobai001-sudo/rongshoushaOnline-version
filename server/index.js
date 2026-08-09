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
// 可用英雄池（与 gameEngine.HERO_POOL 一致）
const HERO_SET = new Set(['xiling', 'niangao', 'lilongxiang', 'zhangyang', 'yeyu', 'baiye', 'tianyi', 'zhuxun']);
// 技能名映射（玛丽追踪记录用）
const SKILL_NAMES = {
  basic_kill: '攻击',
  xiling_kill_same_room: '影杀',
  niangao_kungfu: '功夫',
  lilongxiang_gunshot: '枪毙',
  zhangyang_cut_connection: '断路',
  yeyu_stealth: '潜伏',
  baiye_track: '追踪香囊',
  tianyi_investigate_same_room: '识破',
  zhuxun_double_move: '疾行',
};
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
    list.push({ id: pid, name: p.name, isHost: false, isSpectator: !!p.isSpectator });
  });
  return list;
}

// 就绪数：只算「存活的真玩家」（空壳自动就绪/不阻塞，不能当真人算）
function getReadyCount(room) {
  if (!room || !room.game) return 0;
  return room.game.players.filter(p => p.status === 'alive' && !p.isBot && room.readySet.has(p.id)).length;
}

// 玛丽·追踪香囊：被追踪者成功使用技能/攻击时记录到 trackRecords
function trackSkillUse(game, actorId, skillId, result) {
  if (!game || !game.trackedPlayerId || game.trackedPlayerId !== actorId) return;
  if (!result || !result.ok) return; // 只有成功执行的技能才记录
  const p = game.players.find(x => x.id === actorId);
  const name = SKILL_NAMES[skillId] || skillId;
  game.trackRecords.push({
    round: game.round,
    phase: game.phase,
    action: `使用了【${name}】`,
    locationId: p ? p.locationId : '',
  });
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
        if (room.gameStarted) {
          wsSend(ws, { type: 'error', message: '游戏已开始，无法加入' });
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
          // 房主离开 → 解散房间（先取注册表记录再删除，recordHistory 才会生效）
          room.players.forEach((p) => wsSend(p.ws, { type: 'room_closed', message: '房主已离开' }));
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
        // 玩家 → 服务器（request_state 请求状态 / rename 改名）
        const room = gameRooms.get(ws.roomId);
        if (!room) break;
        const d = msg.data;
        if (d && d.type === 'request_state') {
          const gpId = ws.isHost ? room.game?.players[0].id
            : (room.gamePlayerMap ? room.gamePlayerMap.get(ws.playerId) : null);
          if (room.game) {
            const st = serializeGame(room.game, gpId);
            st.readyCount = getReadyCount(room);
            wsSend(ws, { type: 'from_host', data: { type: 'sync', state: st } });
          }
        } else if (d && d.type === 'action' && d.action === 'rename') {
          // 改名：同步游戏内角色名 + 房间名单（房主/玩家通用），广播给所有人
          const newName = String(d.name || '').trim().slice(0, 8);
          if (!newName) break;
          if (room.game) {
            const gpId = ws.isHost ? room.game.players[0].id
              : (room.gamePlayerMap ? room.gamePlayerMap.get(ws.playerId) : null);
            const gp = room.game.players.find(p => p.id === gpId);
            if (gp) gp.name = newName;
          }
          if (ws.isHost) {
            room.hostName = newName;
            ws.playerName = newName;
            const reg = rooms.get(room.roomId);
            if (reg) { reg.hostName = newName; reg.updatedAt = Date.now(); }
          } else if (ws.playerId) {
            const p = room.players.get(ws.playerId);
            if (p) { p.name = newName; ws.playerName = newName; }
          }
          // 广播最新状态
          if (room.game) {
            const hostSt = serializeGame(room.game, room.game.players[0].id);
            hostSt.readyCount = getReadyCount(room);
            wsSend(room.hostWs, { type: 'from_host', data: { type: 'sync', state: hostSt } });
            room.players.forEach((p, serverId) => {
              const gpId2 = room.gamePlayerMap ? room.gamePlayerMap.get(serverId) : null;
              const st2 = serializeGame(room.game, gpId2);
              st2.readyCount = getReadyCount(room);
              wsSend(p.ws, { type: 'from_host', data: { type: 'sync', state: st2 } });
            });
          }
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
        // 玩家名单：房主 + 已加入的真人玩家 + 调试空壳（bots）
        // 观战者不参与游戏（不进名单/不映射/不发身份）
        const realEntries = [...room.players.entries()].filter(([, p]) => !p.isSpectator);
        const names = [ws.playerName];
        realEntries.forEach(([, p]) => names.push(p.name));
        const bots = Array.isArray(msg.bots) ? msg.bots.map(b => String(b).slice(0, 8)) : [];
        bots.forEach((b) => names.push(b));
        // 房主配置（人数设置）简化：杀手数 = 房主设置的或默认
        room.game = createGame({
          hostName: ws.playerName,
          players: names,
          killerCount: 0, // 默认动态
          botNames: bots, // 标记空壳玩家（isBot）
        });
        // 调试台配置覆盖（按名字匹配：身份/英雄）
        if (Array.isArray(msg.configs)) {
          msg.configs.forEach(cfg => {
            const gp = room.game.players.find(p => p.name === String(cfg.name || '').slice(0, 8));
            if (!gp) return;
            if (cfg.identity === 'killer' || cfg.identity === 'civilian') gp.identity = cfg.identity;
            if (cfg.heroId && HERO_SET.has(cfg.heroId)) gp.heroId = cfg.heroId;
          });
        }
        // 空壳玩家自动就绪：它们不是真人、不需要操作，但绝不能阻塞游戏推进
        room.game.players.forEach(gp => { if (gp.isBot) room.readySet.add(gp.id); });
        // 建立 serverId ↔ gamePlayerId 映射（房主=players[0]，随后依次是真人玩家）
        room.gamePlayerMap = new Map();
        room.gamePlayerMap.set(ws.playerId, room.game.players[0].id);
        let gi = 1;
        realEntries.forEach(([serverId]) => {
          if (room.game.players[gi]) room.gamePlayerMap.set(serverId, room.game.players[gi].id);
          gi++;
        });
        room.gameStarted = true;
        // 私发身份给每个真人玩家
        room.game.players.forEach((gp, i) => {
          if (i === 0) return; // 房主自己知道（room.hostWs）
          const serverId = realEntries[i - 1]?.[0];
          if (serverId) {
            wsSend(room.players.get(serverId).ws, {
              type: 'from_host', data: { type: 'your_role', playerId: gp.id, identity: gp.identity, heroId: gp.heroId },
            });
          }
        });
        // 通知所有玩家进入游戏 + 分别私发带身份的状态
        // 房主
        wsSend(room.hostWs, { type: 'from_host', data: { type: 'game_started' } });
        const hostInitSt = serializeGame(room.game, room.game.players[0].id);
        hostInitSt.readyCount = getReadyCount(room);
        wsSend(room.hostWs, { type: 'from_host', data: { type: 'game_init', state: hostInitSt } });
        // 玩家（各自身份）
        room.players.forEach((p, serverId) => {
          wsSend(p.ws, { type: 'from_host', data: { type: 'game_started' } });
          const gpId = room.gamePlayerMap ? room.gamePlayerMap.get(serverId) : null;
          const st = serializeGame(room.game, gpId);
          st.readyCount = getReadyCount(room);
          wsSend(p.ws, { type: 'from_host', data: { type: 'game_init', state: st } });
        });
        break;
      }

      case 'game_action': {
        const room = gameRooms.get(ws.roomId);
        if (!room || !room.game) return;
        const action = msg.action;   // 顶层action（netSendGameAction格式）
        const payload = msg.data || {};
        const game = room.game;

        // 玩家身份：用映射
        const myGamePlayerId = room.gamePlayerMap ? room.gamePlayerMap.get(ws.playerId) : null;
        if (!myGamePlayerId) return;

        switch (action) {
          case 'move': {
            // 只用服务器映射的玩家身份，忽略客户端传的 playerId（防越权移动别人的角色）
            movePlayer(game, myGamePlayerId, payload.locationId);
            break;
          }
          case 'attack': {
            const result = useSkill(game, myGamePlayerId, 'basic_kill', payload.targetId);
            trackSkillUse(game, myGamePlayerId, 'basic_kill', result);
            if (result && !result.ok && result.msg) {
              wsSend(ws, { type: 'from_host', data: { type: 'private_info', text: '⚠️ ' + result.msg } });
            }
            break;
          }
          case 'skill': {
            const result = useSkill(game, myGamePlayerId, payload.skillId, payload.targetId, payload.targetLocationId);
            trackSkillUse(game, myGamePlayerId, payload.skillId, result);
            if (result && !result.ok && result.msg) {
              // 技能/攻击失败：私发原因（此前静默拒绝，操作者完全不知道发生了什么）
              wsSend(ws, { type: 'from_host', data: { type: 'private_info', text: '⚠️ ' + result.msg } });
            }
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

        // 全部存活真人就绪 → 自动推进（空壳不是真人，不阻塞游戏）
        const aliveIds = game.players.filter(p => p.status === 'alive' && !p.isBot).map(p => p.id);
        const allReady = aliveIds.length === 0 || aliveIds.every(id => room.readySet.has(id));
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

        // 广播状态（每个玩家看到自己身份）
        const hostSt = serializeGame(game, game.players[0].id);
        hostSt.readyCount = getReadyCount(room);
        wsSend(room.hostWs, { type: 'from_host', data: { type: 'sync', state: hostSt } });
        room.players.forEach((p, serverId) => {
          const gpId = room.gamePlayerMap ? room.gamePlayerMap.get(serverId) : null;
          const st = serializeGame(game, gpId);
          st.readyCount = getReadyCount(room);
          wsSend(p.ws, { type: 'from_host', data: { type: 'sync', state: st } });
        });
        break;
      }

      case 'request_state': {
        // 玩家请求状态 → 服务器补发（含该玩家身份）
        const room = gameRooms.get(ws.roomId);
        if (room && room.game) {
          const gpId = ws.isHost ? room.game.players[0].id
            : (room.gamePlayerMap ? room.gamePlayerMap.get(ws.playerId) : null);
          const st = serializeGame(room.game, gpId);
          st.readyCount = getReadyCount(room);
          wsSend(ws, { type: 'from_host', data: { type: 'sync', state: st } });
        }
        break;
      }

      case 'room_list_request':
        broadcastRoomList();
        break;

      case 'room_members_request': {
        // 房主定期轮询成员列表（兜底：player_joined 通知偶发丢失时也能补齐显示）
        const room = gameRooms.get(ws.roomId);
        if (room) {
          wsSend(ws, { type: 'room_members', players: memberList(room) });
        }
        break;
      }

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
        // 同步清理公开注册表（否则大厅残留死房间，别人加入报"房间不存在"）
        const rm = rooms.get(room.roomId);
        if (rm) { recordHistory(rm); rooms.delete(room.roomId); }
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
