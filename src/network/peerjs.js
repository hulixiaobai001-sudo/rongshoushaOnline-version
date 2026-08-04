/**
 * 绒兽杀 P2P 网络层
 * 基于 PeerJS 的浏览器直连，无需服务器
 * 
 * 使用方式：
 *   房主: createRoom().then(room => ...)
 *   玩家: joinRoom(roomId, myName).then(room => ...)
 */

const PEERJS_HOST = '0.peerjs.com'
const PEERJS_PORT = 443
const PEERJS_PATH = '/'

let peer = null
let connections = new Map()  // peerId -> DataConnection
let playerNames = new Map()  // peerId -> name
let roomId = null
let isHost = false
let myId = null
let myName = ''

// 回调函数（由外部注册）
const callbacks = {
  onPlayerJoin: null,
  onPlayerLeave: null,
  onHostCommand: null,
  onPlayerAction: null,
  onDisconnect: null,
  onError: null,
}

/**
 * 加载 PeerJS（从 CDN）
 */
function loadPeerJS() {
  return new Promise((resolve, reject) => {
    if (typeof Peer !== 'undefined') {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('无法加载 PeerJS'))
    document.head.appendChild(script)
  })
}

/**
 * 创建房间（房主）
 */
export async function createRoom(customId) {
  await loadPeerJS()
  
  return new Promise((resolve, reject) => {
    let roomId = customId || generateId()
    peer = new Peer(roomId, {
      host: PEERJS_HOST,
      port: PEERJS_PORT,
      path: PEERJS_PATH,
    })

    peer.on('open', (id) => {
      isHost = true
      myId = id
      roomId = id
      console.log('[P2P] 房间已创建:', roomId)
      resolve({ roomId, playerId: id, isHost: true })
    })

    peer.on('connection', (conn) => {
      const playerId = conn.peer
      connections.set(playerId, conn)
      console.log('[P2P] 玩家加入:', playerId)

      conn.on('data', (data) => {
        if (data && data.type === 'join') {
          // 玩家上报名字
          const name = String(data.name || '玩家').slice(0, 20)
          playerNames.set(playerId, name)
          broadcast({ type: 'player_joined', playerId, name })
          if (callbacks.onPlayerJoin) callbacks.onPlayerJoin(playerId, name)
        } else if (callbacks.onPlayerAction) {
          callbacks.onPlayerAction({ playerId, ...data })
        }
      })

      conn.on('close', () => {
        const name = playerNames.get(playerId)
        connections.delete(playerId)
        playerNames.delete(playerId)
        broadcast({ type: 'player_left', playerId, name })
        if (callbacks.onPlayerLeave) callbacks.onPlayerLeave(playerId, name)
      })

      // 通知所有玩家新玩家加入（在收到join前先广播ID）
      broadcast({ type: 'player_joined', playerId, name: '连接中...' })
    })

    peer.on('error', (err) => {
      if (callbacks.onError) callbacks.onError(err)
      reject(err)
    })
  })
}

/**
 * 加入房间
 */
export async function joinRoom(targetRoomId, playerName) {
  await loadPeerJS()
  myName = String(playerName || '玩家').slice(0, 20)
  
  return new Promise((resolve, reject) => {
    peer = new Peer(generateId(), {
      host: PEERJS_HOST,
      port: PEERJS_PORT,
      path: PEERJS_PATH,
    })

    peer.on('open', (id) => {
      myId = id
      console.log('[P2P] 连接中...', targetRoomId)

      const conn = peer.connect(targetRoomId, { reliable: true })
      
      conn.on('open', () => {
        isHost = false
        roomId = targetRoomId
        connections.set(targetRoomId, conn)
        // 上报自己的名字
        conn.send({ type: 'join', name: myName })
        console.log('[P2P] 已加入房间:', targetRoomId)
        resolve({ roomId: targetRoomId, playerId: id, isHost: false })
      })

      conn.on('data', (data) => {
        if (callbacks.onHostCommand) callbacks.onHostCommand(data)
      })

      conn.on('close', () => {
        if (callbacks.onDisconnect) callbacks.onDisconnect()
      })

      conn.on('error', (err) => {
        if (callbacks.onError) callbacks.onError(err)
        reject(err)
      })
    })

    peer.on('error', (err) => {
      if (callbacks.onError) callbacks.onError(err)
      reject(err)
    })
  })
}

/**
 * 房主广播消息给所有玩家
 */
export function broadcast(data) {
  connections.forEach((conn) => {
    if (conn.open) conn.send(data)
  })
}

/**
 * 发送数据给房主（玩家用）
 */
export function sendToHost(data) {
  if (isHost) {
    if (callbacks.onPlayerAction) callbacks.onPlayerAction({ playerId: myId, ...data })
    return
  }
  const hostConn = connections.get(roomId)
  if (hostConn && hostConn.open) {
    hostConn.send(data)
  }
}

/**
 * 房主发送数据给指定玩家（私发身份等）
 */
export function sendToPeer(peerId, data) {
  const conn = connections.get(peerId)
  if (conn && conn.open) conn.send(data)
}

/**
 * 玩家发送操作给房主
 */
export function sendAction(action, data = {}) {
  sendToHost({ type: 'game_action', action, data })
}

/**
 * 房主发送指令给指定玩家或全部
 */
export function sendCommand(command, data = {}, targetPeerId = null) {
  if (targetPeerId) {
    const conn = connections.get(targetPeerId)
    if (conn && conn.open) conn.send({ command, data })
  } else {
    broadcast({ command, data })
  }
}

/**
 * 断开连接
 */
export function disconnect() {
  connections.forEach((conn) => conn.close())
  if (peer) peer.destroy()
  connections.clear()
  playerNames.clear()
  peer = null
  roomId = null
  isHost = false
  myId = null
  myName = ''
}

/**
 * 注册回调
 */
export function on(event, fn) {
  const key = 'on' + event.charAt(0).toUpperCase() + event.slice(1)
  callbacks[key] = fn
}

/**
 * 获取状态
 */
export function getState() {
  return { isHost, roomId, myId, myName, playerCount: connections.size + (isHost ? 1 : 0) }
}

/**
 * 获取加入玩家名字列表
 */
export function getPlayerNames() {
  return Object.fromEntries(playerNames)
}

function generateId() {
  return 'rs_' + Math.random().toString(36).substring(2, 8)
}

// ============================================
// 消息类型（协议定义）
// ============================================
export const MSG = {
  // 玩家 → 房主
  PLAYER_MOVE: 'player_move',
  PLAYER_ACTION: 'player_skill',
  PLAYER_VOTE: 'player_vote',
  PLAYER_READY: 'player_ready',

  // 房主 → 玩家
  HOST_STATE: 'game_state',
  HOST_IDENTITY: 'your_identity',
  HOST_PHASE: 'phase_change',
  HOST_DEATH: 'death_report',
  HOST_VOTE: 'vote_result',

  // 广播
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  ROOM_CLOSED: 'room_closed',
}
