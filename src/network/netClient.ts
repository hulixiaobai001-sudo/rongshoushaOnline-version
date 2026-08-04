// ============================================
// 联机网络客户端（WebSocket 直连服务器）
// 对接 server/index.js 的 WS 房间路由协议
// 服务器做消息路由，房主跑游戏逻辑
// ============================================

interface RoomMember {
  id: string
  name: string
  isHost: boolean
}

type NetHandler = (data: any) => void

const handlers: Record<string, NetHandler[]> = {}

let ws: WebSocket | null = null
let connected = false
let myState = { isHost: false, roomId: '', playerId: '', playerName: '' }

function getWsUrl(): string {
  const base = window.location.origin
  return base.replace(/^http/, 'ws') + '/'
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function openSocket(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      if (ws.readyState === WebSocket.OPEN) { resolve(); return }
      ws.onopen = () => resolve()
      return
    }
    try {
      ws = new WebSocket(getWsUrl())
    } catch (e) {
      reject(e)
      return
    }
    ws.onopen = () => { connected = true; resolve() }
    ws.onclose = () => { connected = false }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        handleMessage(msg)
      } catch { /* ignore */ }
    }
    ws.onerror = (e) => { reject(e) }
  })
}

function handleMessage(msg: any) {
  switch (msg.type) {
    case 'room_created':
      myState = { isHost: true, roomId: msg.roomId, playerId: msg.playerId, playerName: '' }
      fire('onCreated', msg)
      break
    case 'room_joined':
      myState = { isHost: false, roomId: msg.roomId, playerId: msg.playerId, playerName: '' }
      fire('onJoined', msg)
      break
    case 'player_joined':
      fire('onPlayerJoin', msg)
      break
    case 'player_left':
      fire('onPlayerLeave', msg)
      break
    case 'from_host':
      fire('onHostMessage', msg.data)
      break
    case 'from_player':
      fire('onPlayerMessage', msg)
      break
    case 'room_closed':
      fire('onRoomClosed', msg)
      break
    case 'error':
      fire('onError', msg)
      break
    default:
      break
  }
}

function fire(event: string, data: any) {
  if (handlers[event]) {
    handlers[event].forEach(fn => {
      try { fn(data) } catch { /* ignore */ }
    })
  }
}

function send(obj: any) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj))
  }
}

// ============================================
// API
// ============================================

/** 创建房间（房主） */
export async function netCreateRoom(roomId: string, hostName: string, opts: { isPublic?: boolean; maxPlayers?: number } = {}): Promise<any> {
  await openSocket()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('创建房间超时')), 8000)
    const createdFn = (msg: any) => {
      clearTimeout(timer)
      myState.playerName = hostName
      resolve(msg)
    }
    const errorFn = (msg: any) => {
      clearTimeout(timer)
      reject(new Error(msg.message || '创建失败'))
    }
    if (!handlers['onCreated']) handlers['onCreated'] = []
    handlers['onCreated'].push(createdFn)
    if (!handlers['onError']) handlers['onError'] = []
    handlers['onError'].push(errorFn)
    // 清理（避免重复触发）
    setTimeout(() => {
      handlers['onCreated'] = (handlers['onCreated'] || []).filter(f => f !== createdFn)
      handlers['onError'] = (handlers['onError'] || []).filter(f => f !== errorFn)
    }, 15000)
    send({
      type: 'room_create',
      roomId,
      hostName,
      isPublic: !!opts.isPublic,
      maxPlayers: opts.maxPlayers || 8,
    })
  })
}

/** 加入房间（玩家） */
export async function netJoinRoom(roomId: string, playerName: string): Promise<any> {
  await openSocket()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('加入房间超时')), 8000)
    const joinedFn = (msg: any) => {
      clearTimeout(timer)
      myState.playerName = playerName
      resolve(msg)
    }
    const errFn2 = (msg: any) => {
      clearTimeout(timer)
      reject(new Error(msg.message || '加入失败'))
    }
    if (!handlers['onJoined']) handlers['onJoined'] = []
    handlers['onJoined'].push(joinedFn)
    if (!handlers['onError']) handlers['onError'] = []
    handlers['onError'].push(errFn2)
    setTimeout(() => {
      handlers['onJoined'] = (handlers['onJoined'] || []).filter(f => f !== joinedFn)
      handlers['onError'] = (handlers['onError'] || []).filter(f => f !== errFn2)
    }, 15000)
    send({ type: 'room_join', roomId, playerName })
  })
}

/** 玩家发消息给房主 */
export function netToHost(data: any) {
  send({ type: 'to_host', data })
}

/** 房主广播给所有玩家 */
export function netBroadcast(data: any) {
  send({ type: 'to_players', data })
}

/** 房主私发给指定玩家 */
export function netToPeer(peerId: string, data: any) {
  send({ type: 'to_peer', peerId, data })
}

/** 离开房间 */
export function netLeaveRoom() {
  send({ type: 'room_leave' })
}

/** 注册事件回调 */
export function netOn(event: 'created' | 'joined' | 'playerJoin' | 'playerLeave' | 'hostMessage' | 'playerMessage' | 'roomClosed' | 'error', fn: NetHandler) {
  const key = 'on' + event.charAt(0).toUpperCase() + event.slice(1)
  if (!handlers[key]) handlers[key] = []
  handlers[key].push(fn)
}

/** 获取状态 */
export function netGetState() {
  return { ...myState, connected }
}

/** 断开连接 */
export function netDisconnect() {
  try { netLeaveRoom() } catch { /* ignore */ }
  if (ws) { try { ws.close() } catch { /* ignore */ } }
  ws = null
  connected = false
  myState = { isHost: false, roomId: '', playerId: '', playerName: '' }
  // 清空所有回调
  Object.keys(handlers).forEach(k => { handlers[k] = [] })
}
