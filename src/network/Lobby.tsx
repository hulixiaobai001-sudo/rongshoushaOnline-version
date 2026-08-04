import { useState, useEffect, useRef } from 'react'
import { netCreateRoom, netJoinRoom, netLeaveRoom, netDisconnect, netOn, netBroadcast, netGetState } from './netClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Copy, Check, Wifi, LogOut, ArrowLeft, RefreshCw, Play, Eye, Bug } from 'lucide-react'
import { OnlineGame } from './OnlineGame'
import { useGameStore } from '@/store/gameStore'
import { registerRoom, updateRoomPlayerCount, unregisterRoom, wsRegisterRoom, wsUpdateRoom, wsUnregisterRoom, closeRoomSocket } from './roomServer'

interface LobbyProps {
  onBack: () => void
  quickJoinCode?: string
}

const DEBUG_PHRASE = '柯基不爱喝茶'


// ═══════════════════════════════════════════════════
//  玩家管理面板（房主：加人/删人/身份/角色）
// ═══════════════════════════════════════════════════
function RoleAssignmentPanel() {
  const store = useGameStore()
  const [expanded, setExpanded] = useState(false)
  const [newName, setNewName] = useState('')
  const players = store.players
  const [editIdentity, setEditIdentity] = useState<Record<string, 'killer' | 'civilian'>>({})
  const [editHero, setEditHero] = useState<Record<string, string>>({})

  const addPlayer = () => {
    const name = (newName || '').trim() || `玩家${players.length + 1}`
    if (players.length >= 12) { alert('最多12名玩家'); return }
    store.addPlayer(name)
    setNewName('')
  }

  const removePlayer = (id: string) => {
    store.removePlayer(id)
  }

  const toggleIdentity = (playerId: string) => {
    const player = players.find((p: any) => p.id === playerId)
    if (!player) return
    const current = editIdentity[playerId] || player.identity || 'civilian'
    const newId = current === 'killer' ? 'civilian' : 'killer'
    setEditIdentity({ ...editIdentity, [playerId]: newId })
    store.setPlayerIdentity(playerId, newId)
  }

  const setPlayerHero = (playerId: string, heroId: string) => {
    setEditHero({ ...editHero, [playerId]: heroId })
    store.setPlayerHero(playerId, heroId)
  }

  const totalKillers = players.filter((p: any) => (editIdentity[p.id] || p.identity) === 'killer').length

  return (
    <Card className="bg-slate-800 border-indigo-700">
      <CardContent className="p-3">
        <button onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-xs font-bold text-indigo-400">
          <span>🎭 房间设置（{players.length}/12 人 · 🔴杀手 {totalKillers} · 🔵平民 {players.length - totalKillers}）</span>
          <span>{expanded ? '收起' : '展开'}</span>
        </button>
        {expanded && (
          <div className="mt-2 mb-3 flex items-center gap-2 bg-slate-900/40 rounded-lg p-2">
            <span className="text-[10px] text-slate-400 shrink-0">杀手</span>
            <div className="flex items-center gap-1">
              <button onClick={() => store.setKillerCount(Math.max(1, store.killerCount - 1))}
                className="w-5 h-5 rounded bg-slate-700 text-white text-[10px] hover:bg-slate-600">-</button>
              <span className="w-6 text-center text-xs font-bold text-white">{store.killerCount}</span>
              <button onClick={() => store.setKillerCount(Math.min(4, store.killerCount + 1))}
                className="w-5 h-5 rounded bg-slate-700 text-white text-[10px] hover:bg-slate-600">+</button>
            </div>
            <span className="text-[10px] text-slate-400 shrink-0 ml-2">平民</span>
            <div className="flex items-center gap-1">
              <button onClick={() => store.setCivilianCount(Math.max(1, store.civilianCount - 1))}
                className="w-5 h-5 rounded bg-slate-700 text-white text-[10px] hover:bg-slate-600">-</button>
              <span className="w-6 text-center text-xs font-bold text-white">{store.civilianCount}</span>
              <button onClick={() => store.setCivilianCount(Math.min(11, store.civilianCount + 1))}
                className="w-5 h-5 rounded bg-slate-700 text-white text-[10px] hover:bg-slate-600">+</button>
            </div>
            <span className="text-[10px] text-slate-500 ml-auto">{store.killerCount + store.civilianCount}人</span>
          </div>
        )}
        {expanded && (
          <div className="mt-2 space-y-2">
            {/* 添加玩家 */}
            <div className="flex gap-1.5">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={8}
                placeholder="输入玩家名字（可留空自动编号）"
                onKeyDown={(e) => { if (e.key === 'Enter') addPlayer() }}
                className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none" />
              <Button size="sm" onClick={addPlayer} disabled={players.length >= 12}
                className="bg-indigo-600 hover:bg-indigo-700 h-8 text-xs shrink-0">
                添加
              </Button>
            </div>

            {/* 玩家列表 */}
            <div className="space-y-1.5 max-h-[260px] overflow-auto">
              {players.length === 0 && (
                <p className="text-[10px] text-slate-500 text-center py-2">还没有玩家，点击上方「添加」创建（至少4人开局）</p>
              )}
              {players.map((p: any) => {
                const curIdentity = editIdentity[p.id] || p.identity || 'civilian'
                const curHero = editHero[p.id] || p.heroId
                return (
                  <div key={p.id} className="flex items-center gap-1.5 bg-slate-900/50 rounded px-2 py-1.5">
                    <span className="text-xs text-slate-300 w-14 truncate shrink-0">{p.name}</span>
                    <button onClick={() => toggleIdentity(p.id)}
                      className={`text-[10px] px-2 py-0.5 rounded font-medium shrink-0 ${
                        curIdentity === 'killer' ? 'bg-red-900/60 text-red-300' : 'bg-blue-900/60 text-blue-300'
                      }`}>
                      {curIdentity === 'killer' ? '🔴杀手' : '🔵平民'}
                    </button>
                    <select value={curHero} onChange={(e) => setPlayerHero(p.id, e.target.value)}
                      className="flex-1 text-[9px] bg-slate-800 border border-slate-600 rounded px-1 py-0.5 text-slate-300 min-w-0">
                      <option value="">随机英雄</option>
                      <option value="xiling">西凌</option>
                      <option value="kexiong">科雄</option>
                      <option value="niangao">年糕</option>
                      <option value="lilongxiang">李龙祥</option>
                      <option value="zhuxun">竹隼</option>
                      <option value="zhangyang">张扬</option>
                      <option value="fengming">冯明</option>
                      <option value="wangli">王力</option>
                      <option value="yeyu">夜羽</option>
                      <option value="baiye">白野</option>
                      <option value="tianyi">天燚</option>
                      <option value="jiangfeng">江枫</option>
                    </select>
                    <button onClick={() => removePlayer(p.id)}
                      className="text-slate-500 hover:text-red-400 text-xs shrink-0 w-4">✕</button>
                  </div>
                )
              })}
            </div>

            {/* 快速填充 */}
            {players.length < 4 && (
              <Button variant="outline" size="sm" onClick={() => {
                const current = store.players.length
                for (let i = current; i < 4; i++) {
                  store.addPlayer(`玩家${i + 1}`)
                }
              }} className="w-full h-7 text-[10px] border-indigo-700 text-indigo-400 hover:bg-indigo-950">
                ⚡ 快速补满4人
              </Button>
            )}

            <p className="text-[9px] text-slate-500 text-center">点击身份切换 🔴杀手/🔵平民 · 下拉选英雄 · 开局后生效</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function Lobby({ onBack, quickJoinCode }: LobbyProps) {
  const [mode, setMode] = useState<'host' | 'join' | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [inputCode, setInputCode] = useState('')
  const [roomPublic, setRoomPublic] = useState(true)
  const [roomPassword, setRoomPassword] = useState('')
  const [status, setStatus] = useState('')
  const [players, setPlayers] = useState<string[]>([])
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({})
  const [myName, setMyName] = useState(() => {
    try { return localStorage.getItem('rs_player_name') || '' } catch { return '' }
  })
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showWarning, setShowWarning] = useState(true)
  const [isSpectator, setIsSpectator] = useState(false)
  const [debugMode, setDebugMode] = useState(false)
  const [debugInput, setDebugInput] = useState('')
  const [inGame, setInGame] = useState(false)
  const [botPlayerNames, setBotPlayerNames] = useState<string[]>([])
  const connectingRef = useRef(false)
  const roomHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 防刷新：恢复玩家名，显示重连提示；支持从大厅快速加入
  useEffect(() => {
    const savedName = localStorage.getItem('rs_player_name')
    if (savedName) setMyName(savedName)
    if (quickJoinCode) {
      setInputCode(quickJoinCode)
      setStatus('正在加入房间 ' + quickJoinCode + ' ...')
      // 延迟一下让组件先渲染
      const t = setTimeout(() => { handleJoinRoom() }, 300)
      return () => clearTimeout(t)
    }
    const savedRoom = localStorage.getItem('rs_room_code')
    if (savedRoom) {
      setInputCode(savedRoom)
      setStatus('检测到上次的房间(' + savedRoom + ')，点击「加入」可快速重连')
    }
  }, [])

  useEffect(() => {
    netOn('playerJoin', (msg: any) => {
      setPlayers((prev: string[]) => {
        if (!prev.includes(msg.playerId)) return [...prev, msg.playerId]
        return prev
      })
      // 记录加入顺序（供游戏私发身份）
      try {
        const order = localStorage.getItem('rs_join_order')
        const list = order ? JSON.parse(order) : []
        if (!list.includes(msg.playerId)) {
          list.push(msg.playerId)
          localStorage.setItem('rs_join_order', JSON.stringify(list))
        }
      } catch { /* ignore */ }
      if (msg.name) setPlayerNames(prev => ({ ...prev, [msg.playerId]: msg.name }))
      if (isSpectator) {
        setStatus(prev => prev + `\n👁️ ${msg.name || '观战者'} 以观战模式加入`)
      }
    })
    netOn('playerLeave', (msg: any) => {
      setPlayers((prev: string[]) => prev.filter((id: string) => id !== msg.playerId))
    })
    // 玩家端：监听房主指令（收到 start_game 进入游戏）
    netOn('hostMessage', (data: any) => {
      if (data && (data.type === 'start_game' || data.command === 'start_game')) {
        setStatus('房主已开始游戏！')
        setInGame(true)
      }
    })
    netOn('roomClosed', () => {
      setStatus('房间已关闭')
      setMode(null)
      setInGame(false)
    })
    return () => { netDisconnect() }
  }, [])

  const handleCreateRoom = async (customCode?: string) => {
    if (connectingRef.current) return
    // 检查房主名
    let name = myName
    if (!name) {
      name = prompt('请输入你的玩家名称（房主）：') || ''
      if (!name.trim()) { setStatus('请输入玩家名称'); return }
      setMyName(name)
      localStorage.setItem('rs_player_name', name)
    }
    connectingRef.current = true
    setLoading(true)
    setStatus('正在创建房间...')
    try {
      const room = await netCreateRoom(customCode || '', name, { isPublic: roomPublic })
      setMode('host')
      setRoomCode(room.roomId)
      setPlayers([room.playerId])
      setPlayerNames({[room.playerId]: name})
      // 保存房间信息到localStorage（防刷新）
      localStorage.setItem('rs_room_code', room.roomId)
      localStorage.setItem('rs_room_role', 'host')
      // 注册到房间服务器（公开房间显示在大厅）
      const regData = {
        roomId: room.roomId,
        hostId: room.playerId,
        hostName: name,
        playerCount: 1,
        maxPlayers: 8,
        isPublic: roomPublic,
        hasPassword: !!roomPassword,
      }
      registerRoom(regData)
      wsRegisterRoom(regData)
      // 房主心跳：每30秒更新，服务器检测到房主失联会清理房间
      if (roomHeartbeatRef.current) clearInterval(roomHeartbeatRef.current)
      roomHeartbeatRef.current = setInterval(() => {
        updateRoomPlayerCount(room.roomId, players.length || 1)
        wsUpdateRoom(room.roomId, players.length || 1)
      }, 15000)
      setStatus('房间已创建，等待玩家加入...')
    } catch (e: unknown) {
      setStatus('创建失败：' + (e instanceof Error ? e.message : '未知错误'))
    } finally {
      setLoading(false)
      connectingRef.current = false
    }
  }

  const handleJoinRoom = async () => {
    if (!inputCode.trim() || connectingRef.current) return
    // 检查玩家名
    let name = myName
    if (!name) {
      name = prompt('请输入你的玩家名称：') || ''
      if (!name.trim()) { setStatus('请输入玩家名称'); return }
      setMyName(name)
      localStorage.setItem('rs_player_name', name)
    }
    connectingRef.current = true
    setLoading(true)
    setStatus('正在加入房间...')
    try {
      const room = await netJoinRoom(inputCode.trim(), name, isSpectator)
      // 保存房间信息到localStorage（防刷新）
      localStorage.setItem('rs_room_code', inputCode.trim())
      localStorage.setItem('rs_room_role', 'player')
      setMode('join')
      setRoomCode(room.roomId)
      setStatus('已加入房间，等待房主开始游戏...')
      // 更新房间人数
      updateRoomPlayerCount(room.roomId, 2)
      wsUpdateRoom(room.roomId, 2)
    } catch (e: unknown) {
      setStatus('加入失败：' + (e instanceof Error ? e.message : '未知错误'))
    } finally {
      setLoading(false)
      connectingRef.current = false
    }
  }

  const handleLeaveRoom = () => {
    // 清理心跳
    if (roomHeartbeatRef.current) { clearInterval(roomHeartbeatRef.current); roomHeartbeatRef.current = null }
    // 注销房间（仅房主）
    if (roomCode && mode === 'host') {
      unregisterRoom(roomCode)
      wsUnregisterRoom(roomCode)
    }
    closeRoomSocket()
    netLeaveRoom()
    netDisconnect()
    setMode(null)
    setRoomCode('')
    setPlayers([])
    setPlayerNames({})
    setStatus('')
    setDebugMode(false)
    setInGame(false)
    setBotPlayerNames([])
    // 清除防刷新数据
    localStorage.removeItem('rs_room_code')
    localStorage.removeItem('rs_room_role')
    connectingRef.current = false
    setLoading(false)
  }

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 调试模式：用空壳玩家填充（不挤占已有联机玩家）
  const enterDebugMode = () => {
    const existing = players.filter(p => !p.startsWith('bot_'))
    const existingCount = existing.length
    const needed = Math.max(0, 8 - existingCount) // 填充到8人
    const botIds = Array.from({ length: needed }, (_, i) => `bot_${i + 1}`)
    const botNames = Array.from({ length: needed }, (_, i) => `空壳玩家${i + 1}`)
    setPlayers([...existing, ...botIds])
    setBotPlayerNames(botNames)
    const namesMap = {...playerNames}
    botIds.forEach((id, i) => { namesMap[id] = botNames[i] })
    setPlayerNames(namesMap)
    setDebugMode(true)
    setStatus(`调试模式已启动（${existingCount}名联机玩家 + ${needed}个空壳）`)
  }

  const handleStartGame = () => {
    // 保存联机玩家信息（供OnlineGame生成真实玩家）
    const joinList = players.map((pid: string) => ({ serverId: pid, name: playerNames[pid] || '玩家' }))
    try {
      localStorage.setItem('rs_join_players', JSON.stringify(joinList))
    } catch { /* ignore */ }
    netBroadcast({ type: 'start_game' })
    setInGame(true)
  }

  const currentRoom = netGetState()

  // 如果在游戏中
  if (inGame) {
    return (
      <OnlineGame
        isHost={mode === 'host'}
        isSpectator={isSpectator}
        joinedPlayers={players.map((pid: string) => ({ serverId: pid, name: playerNames[pid] || '玩家' }))}
        debugMode={debugMode}
        botNames={botPlayerNames}
        onLeave={() => { setInGame(false); handleLeaveRoom() }}
      />
    )
  }

  // ========== 首次警告提示 ==========
  if (showWarning) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900 p-4">
        <Card className="w-full max-w-md bg-slate-800 border-amber-700">
          <CardContent className="p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-amber-900/50 border-2 border-amber-500 flex items-center justify-center mx-auto">
              <span className="text-3xl">⚠️</span>
            </div>
            <h2 className="text-lg font-bold text-white">联机模式</h2>
            <p className="text-sm text-slate-300">
              截止目前，联机功能尚未开发完成，可能会出现各种 bug。
            </p>
            <p className="text-xs text-amber-400">
              如果你是测试人员，请点击"确定"继续。
            </p>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={onBack} className="flex-1 border-slate-600 text-slate-300">返回</Button>
              <Button onClick={() => setShowWarning(false)} className="flex-1 bg-amber-600 hover:bg-amber-700">确定</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      <header className="px-3 md:px-4 py-3 border-b border-slate-700 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={mode ? handleLeaveRoom : onBack}
          className="h-8 px-2 text-slate-300 hover:text-white hover:bg-slate-800">
          <ArrowLeft className="w-4 h-4 mr-1" />
          {mode ? '退出房间' : '返回'}
        </Button>
        <div className="flex-1" />
        {debugMode && <Badge className="text-[10px] bg-amber-600">调试模式</Badge>}
        {currentRoom.roomId && (
          <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-600">
            <Wifi className="w-3 h-3 mr-1" />
            {currentRoom.isHost ? '房主' : '玩家'}{isSpectator && '（观战）'}
          </Badge>
        )}
      </header>

      <main className="flex-1 overflow-auto p-3 md:p-4">
        <div className="max-w-md mx-auto space-y-4">
          {!mode ? (
            <>
              {currentRoom.roomId && (
                <Card className="bg-slate-800 border-slate-700">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-400">当前房间</p>
                      <p className="text-sm text-white font-mono">{currentRoom.roomId}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleLeaveRoom}
                      className="text-xs text-red-400 border-red-700 hover:bg-red-950">
                      <LogOut className="w-3 h-3 mr-1" />断开
                    </Button>
                  </CardContent>
                </Card>
              )}

              <div className="text-center mb-4">
                <Wifi className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <h2 className="text-lg font-bold text-white">联机模式</h2>
                <p className="text-xs text-slate-400 mt-1">通过服务器联机，全网可玩</p>
              </div>

              {/* 房间可见性 */}
              <div className="flex items-center gap-3 bg-slate-800 rounded-lg p-3 border border-slate-700">
                <span className="text-sm text-slate-300 shrink-0">🔒 房间</span>
                <div className="flex-1" />
                <div className="flex gap-1 bg-slate-900 rounded-lg p-0.5">
                  <button onClick={() => setRoomPublic(true)}
                    className={`px-3 py-1 rounded-md text-xs ${roomPublic ? 'bg-emerald-700 text-white' : 'text-slate-400'}`}>公开</button>
                  <button onClick={() => setRoomPublic(false)}
                    className={`px-3 py-1 rounded-md text-xs ${!roomPublic ? 'bg-slate-600 text-white' : 'text-slate-400'}`}>私密</button>
                </div>
              </div>
              {!roomPublic && (
                <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-2 border border-slate-700">
                  <input value={roomPassword} onChange={(e) => setRoomPassword(e.target.value)} maxLength={12}
                    placeholder="房间密码（可选）"
                    className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none" />
                </div>
              )}

              {/* 自定义房间码 */}
              <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-2 border border-slate-700">
                <input id="roomCodeInput" placeholder="输入房间码（可选，留空自动生成）" maxLength={12}
                  className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreateRoom() }} />
              </div>
              <Button onClick={() => {
                const input = (document.getElementById('roomCodeInput') as HTMLInputElement)?.value?.trim()
                handleCreateRoom(input)
              }} disabled={loading}
                className="w-full h-12 text-base bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">
                {loading ? '创建中...' : '创建房间（房主）'}
              </Button>

              <div className="flex items-center gap-3 bg-slate-800 rounded-lg p-3 border border-slate-700">
                <Eye className="w-5 h-5 text-slate-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-slate-300">观战模式</p>
                  <p className="text-xs text-slate-500">以观众身份加入，仅可观看无法操作</p>
                </div>
                <Button variant={isSpectator ? 'default' : 'outline'} size="sm"
                  onClick={() => {
                    setIsSpectator(!isSpectator)
                    if (!isSpectator) alert('观战模式开启后，房主将收到你的观战加入通知')
                  }}
                  className={isSpectator ? 'bg-emerald-600' : 'border-slate-600 text-slate-400'}>
                  {isSpectator ? '已开启' : '关闭'}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 border-t border-slate-600" />
                <span className="text-slate-400 text-xs">或</span>
                <div className="flex-1 border-t border-slate-600" />
              </div>

              <div className="flex gap-2">
                <Input placeholder="输入房间码" value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                  className="flex-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 h-10" />
                <Button onClick={handleJoinRoom} disabled={loading} variant="secondary" className="h-10 shrink-0">
                  {loading ? '加入中...' : isSpectator ? '观战' : '加入'}
                </Button>
              </div>

              {/* 调试模式开关 - 口令 */}
              {!debugMode ? (
                <div className="pt-2">
                  <Input placeholder="输入调试口令..." value={debugInput}
                    onChange={(e) => {
                      setDebugInput(e.target.value)
                      if (e.target.value === DEBUG_PHRASE) {
                        setDebugMode(true)
                        setStatus('调试模式已解锁')
                      }
                    }}
                    className="text-xs bg-transparent border-0 text-slate-600 placeholder:text-slate-700 h-6 px-0" />
                </div>
              ) : (
                <p className="text-[10px] text-amber-600/50 text-center">调试模式已激活</p>
              )}
            </>
          ) : mode === 'host' ? (
            <>
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-slate-400 mb-1">房间码</p>
                  <p className="text-3xl font-bold text-white tracking-widest font-mono">{roomCode}</p>
                  <div className="flex justify-center gap-2 mt-2">
                    <Button variant="ghost" size="sm" onClick={copyRoomCode}
                      className="text-emerald-400 hover:text-emerald-300 h-7 text-xs">
                      {copied ? <Check className="w-3.5 h-3.5 mr-1" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                      {copied ? '已复制' : '复制房间码'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleLeaveRoom}
                      className="text-red-400 hover:text-red-300 h-7 text-xs">
                      <LogOut className="w-3.5 h-3.5 mr-1" />解散房间
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-300">玩家列表</span>
                    <Button variant="ghost" size="sm" onClick={() => {
                      const nn = prompt('修改你的名字（8字以内）：', myName || '玩家')
                      if (nn && nn.trim()) {
                        const name = nn.trim().slice(0, 8)
                        setMyName(name)
                        try { localStorage.setItem('rs_player_name', name) } catch {}
                        setPlayerNames(prev => ({ ...prev, [players[0]]: name }))
                        // 房间列表更新房主名
                        if (mode === 'host' && roomCode) {
                          fetch(window.location.origin + '/api/rooms/' + encodeURIComponent(roomCode), {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ hostName: name }),
                          }).catch(() => {})
                        }
                      }
                    }}
                      className="ml-auto h-6 text-[10px] text-indigo-400 hover:text-indigo-300">改名</Button>
                    <Badge variant="outline" className="ml-auto text-xs text-slate-400 border-slate-600">
                      {players.length} 人
                    </Badge>
                  </div>
                  {players.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4">暂无玩家加入</p>
                  ) : (
                    <div className="space-y-1">
                      {players.map((id, i) => {
                        const isHost = i === 0
                        const isBot = id.startsWith('bot_')
                        const name = isHost ? (playerNames[id] || myName || '房主')
                          : isBot ? `空壳${id.slice(-1)}`
                          : (playerNames[id] || `玩家${i}`)
                        return (
                          <div key={id}
                            className={`flex items-center gap-2 text-sm rounded px-2 py-1.5 ${
                              isBot ? 'bg-slate-900/30 text-slate-500' : 'bg-slate-900/50 text-slate-300'
                            }`}>
                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold shrink-0">{i + 1}</span>
                            <span className={isHost ? 'font-medium text-amber-400' : ''}>
                              {name}
                            </span>
                            {isHost && <span className="text-[9px] text-amber-500/70 ml-1">(房主)</span>}
                            {isBot && <span className="text-[9px] text-amber-600/60 ml-auto">空壳</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 房主设置（合并面板） */}
              {mode === 'host' && (
                <RoleAssignmentPanel />
              )}

              {/* 调试模式按钮 */}
              {debugMode && !players.some(p => p.startsWith('bot_')) && (
                <Button onClick={enterDebugMode} variant="outline"
                  className="w-full h-10 text-sm border-amber-600 text-amber-400 hover:bg-amber-950">
                  <Bug className="w-4 h-4 mr-2" />调试模式：填充空壳玩家
                </Button>
              )}

              {/* 开始游戏 */}
              <Button onClick={handleStartGame} disabled={players.length < 4}
                className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
                <Play className="w-5 h-5 mr-2" />{debugMode ? '进入调试' : `开始游戏（${players.length}/4人）`}
              </Button>
              {players.length < 4 && !debugMode && (
                <p className="text-xs text-slate-400 text-center">至少需要4人才能开始</p>
              )}
              {debugMode && players.length < 4 && (
                <p className="text-xs text-amber-500 text-center">点击「填充空壳玩家」补满人数</p>
              )}

              {status && <p className="text-xs text-slate-400 text-center">{status}</p>}
            </>
          ) : (
            <>
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-slate-400 mb-1">已加入房间</p>
                  <p className="text-lg text-emerald-400 font-mono font-bold">{roomCode}</p>
                  <Button variant="ghost" size="sm" onClick={handleLeaveRoom}
                    className="mt-2 text-red-400 hover:text-red-300 h-7 text-xs">
                    <LogOut className="w-3.5 h-3.5 mr-1" />退出房间
                  </Button>
                </CardContent>
              </Card>
              <div className="text-center py-8">
                <RefreshCw className="w-8 h-8 text-emerald-500 mx-auto animate-spin mb-3" />
                <p className="text-sm text-slate-400">等待房主开始游戏...</p>
                <p className="text-xs text-slate-600 mt-2">等待房主开始游戏...</p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
