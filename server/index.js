import { WebSocketServer } from 'ws';
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
// WebSocket 服务器 - 实时房间列表
// ============================================
const wss = new WebSocketServer({ server: httpServer });

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
    if (client.readyState === 1) {
      client.send(msg);
    }
  });
}

wss.on('connection', (ws) => {
  // 连接时推送一次当前房间列表
  broadcastRoomList();

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {
        case 'room_list_request':
          broadcastRoomList();
          break;
        case 'room_register':
          // 注册房间（与 HTTP 相同逻辑）
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
    } catch (e) {
      // 忽略无效消息
    }
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
