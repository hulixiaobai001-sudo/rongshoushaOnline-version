import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Plus, ArrowLeft, Search, Wifi, Lock, Users, RefreshCw } from 'lucide-react'
import { subscribeRoomList, fetchRoomList, type PublicRoom } from './roomServer'

interface LobbyHallProps {
  onCreateRoom: () => void
  onBack: () => void
  onJoinRoom: (roomId: string) => void
}

export function LobbyHall({ onCreateRoom, onBack, onJoinRoom }: LobbyHallProps) {
  const [rooms, setRooms] = useState<PublicRoom[]>([])
  const [loading, setLoading] = useState(false)
  const [serverOk, setServerOk] = useState(false)

  useEffect(() => {
    // 实时订阅
    const unsub = subscribeRoomList((list) => {
      setRooms(list)
      setServerOk(true)
    })
    // HTTP 兜底
    fetchRoomList().then(list => {
      if (list.length > 0) setRooms(list)
      setServerOk(true)
    }).catch(() => setServerOk(false))
    return unsub
  }, [])

  const refresh = async () => {
    setLoading(true)
    const list = await fetchRoomList()
    setRooms(list)
    setLoading(false)
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* 顶部 */}
      <header className="px-3 md:px-4 py-3 border-b border-slate-700 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}
          className="h-8 px-2 text-slate-300 hover:text-white hover:bg-slate-800">
          <ArrowLeft className="w-4 h-4 mr-1" />返回
        </Button>
        <div className="flex-1" />
        <Button onClick={onCreateRoom} size="sm" className="bg-indigo-600 hover:bg-indigo-700 h-8 text-xs">
          <Plus className="w-3.5 h-3.5 mr-1" />创建房间
        </Button>
      </header>

      {/* 搜索框 */}
      <div className="px-3 md:px-4 py-3">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input placeholder="搜索房间..." disabled
            className="pl-9 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 opacity-50" />
        </div>
      </div>

      {/* 房间列表 */}
      <main className="flex-1 overflow-auto px-3 md:px-4 pb-4">
        <div className="max-w-2xl mx-auto">
          {/* 服务器状态提示 */}
          {!serverOk && (
            <div className="mb-3 bg-amber-900/20 border border-amber-800/30 rounded-lg px-3 py-2 text-[10px] text-amber-400/70 text-center">
              房间服务器未连接，只能通过房间码加入
            </div>
          )}

          {rooms.length === 0 ? (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-8 text-center">
                <Wifi className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-medium text-slate-400 mb-1">暂无公开房间</h3>
                <p className="text-sm text-slate-600">
                  创建房间并设为公开即可在这里显示
                </p>
                <Button variant="outline" size="sm" onClick={refresh} disabled={loading}
                  className="mt-4 text-slate-400 border-slate-600">
                  <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />刷新
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-slate-400">公开房间（{rooms.length}）</span>
                <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}
                  className="h-6 text-[10px] text-slate-500">
                  <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />刷新
                </Button>
              </div>
              {rooms.map((room) => (
                <Card key={room.roomId} className="bg-slate-800 border-slate-700 hover:border-indigo-500 transition-colors">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-900/40 border border-indigo-700/40 flex items-center justify-center shrink-0">
                      <Wifi className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{room.hostName}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{room.roomId}</span>
                        {room.hasPassword && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Users className="w-3 h-3 text-slate-500" />
                        <span className="text-[10px] text-slate-400">{room.playerCount}/{room.maxPlayers}</span>
                        <span className="text-[10px] text-slate-600">·</span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(room.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => onJoinRoom(room.roomId)}
                      disabled={room.playerCount >= room.maxPlayers}
                      className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs shrink-0">
                      加入
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
