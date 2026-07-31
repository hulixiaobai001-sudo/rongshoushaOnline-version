// ============================================
// 房间服务器客户端
// 对接 server/index.js 的 HTTP API + WebSocket
// 服务器地址自动取当前页面域名（Railway 同源部署）
// ============================================

/** 自动推断服务器地址（同源部署时用当前 host） */
function getServerBase(): string {
  // 支持手动覆盖（存 localStorage 方便调试）
  const override = localStorage.getItem('rs_server_base');
  if (override) return override.replace(/\/$/, '');
  return window.location.origin;
}

function getWsUrl(): string {
  const base = getServerBase();
  return base.replace(/^http/, 'ws') + '/';
}

export interface PublicRoom {
  roomId: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  hasPassword: boolean;
  createdAt: number;
}

export interface RoomRegisterData {
  roomId: string;
  hostId?: string;
  hostName?: string;
  playerCount?: number;
  maxPlayers?: number;
  isPublic?: boolean;
  hasPassword?: boolean;
}

// ============================================
// HTTP API
// ============================================

/** 获取公开房间列表 */
export async function fetchRoomList(): Promise<PublicRoom[]> {
  try {
    const res = await fetch(getServerBase() + '/api/rooms', {
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.rooms || [];
  } catch {
    return [];
  }
}

/** 注册房间 */
export async function registerRoom(data: RoomRegisterData): Promise<boolean> {
  try {
    const res = await fetch(getServerBase() + '/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 更新房间人数 */
export async function updateRoomPlayerCount(roomId: string, playerCount: number): Promise<boolean> {
  try {
    const res = await fetch(getServerBase() + '/api/rooms/' + encodeURIComponent(roomId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerCount }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** 注销房间 */
export async function unregisterRoom(roomId: string): Promise<void> {
  try {
    await fetch(getServerBase() + '/api/rooms/' + encodeURIComponent(roomId), {
      method: 'DELETE',
    });
  } catch {
    // 忽略
  }
}

// ============================================
// WebSocket 实时房间列表
// ============================================

type RoomListCallback = (rooms: PublicRoom[]) => void;

let ws: WebSocket | null = null;
let roomListCallbacks: RoomListCallback[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let manualClosed = false;

/** 订阅公开房间列表（实时推送） */
export function subscribeRoomList(cb: RoomListCallback): () => void {
  roomListCallbacks.push(cb);
  ensureSocket();
  // 立即拉一次 HTTP 兜底
  fetchRoomList().then(cb);
  return () => {
    roomListCallbacks = roomListCallbacks.filter(f => f !== cb);
  };
}

function notifyRoomList(rooms: PublicRoom[]) {
  roomListCallbacks.forEach(cb => {
    try { cb(rooms); } catch { /* ignore */ }
  });
}

function ensureSocket() {
  if (ws && ws.readyState <= 1) return;
  manualClosed = false;
  try {
    ws = new WebSocket(getWsUrl());
    ws.onopen = () => {
      reconnectAttempts = 0;
      // 请求一次房间列表
      ws?.send(JSON.stringify({ type: 'room_list_request' }));
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'room_list' && Array.isArray(msg.rooms)) {
          notifyRoomList(msg.rooms);
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => {
      if (!manualClosed) scheduleReconnect();
    };
    ws.onerror = () => {
      // 连接失败，交给 onclose 处理重连
    };
  } catch {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectAttempts++;
  const delay = Math.min(5000, 1000 * reconnectAttempts);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!manualClosed) ensureSocket();
  }, delay);
}

/** 通过 WebSocket 注册/更新/注销房间 */
export function wsRegisterRoom(data: RoomRegisterData) {
  try {
    ws?.send(JSON.stringify({ type: 'room_register', ...data }));
  } catch { /* ignore */ }
}

export function wsUpdateRoom(roomId: string, playerCount: number) {
  try {
    ws?.send(JSON.stringify({ type: 'room_update', roomId, playerCount }));
  } catch { /* ignore */ }
}

export function wsUnregisterRoom(roomId: string) {
  try {
    ws?.send(JSON.stringify({ type: 'room_unregister', roomId }));
  } catch { /* ignore */ }
}

/** 关闭连接（离开时调用） */
export function closeRoomSocket() {
  manualClosed = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) {
    try { ws.close(); } catch { /* ignore */ }
    ws = null;
  }
  roomListCallbacks = [];
}
