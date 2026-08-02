import { useState, useEffect, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Shield, RefreshCw, Lock, Globe, Users, Gamepad2, Megaphone } from 'lucide-react'

interface AdminRoom {
  roomId: string
  hostName: string
  playerCount: number
  maxPlayers: number
  isPublic: boolean
  hasPassword: boolean
  createdAt: number
  lastHeartbeat: number
}

interface GameHistory {
  roomId: string
  hostName: string
  playerCount: number
  isPublic: boolean
  startedAt: number
  endedAt: number
}

interface Stats {
  activeRooms: number
  totalPlayers: number
  totalGames: number
  last24hGames: number
  announcement: string
}

function getBase() {
  return window.location.origin
}

export function Admin({ onBack }: { onBack: () => void }) {
  const [token, setToken] = useState<string>(() => {
    try { return sessionStorage.getItem('rs_admin_token') || '' } catch { return '' }
  })
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [rooms, setRooms] = useState<AdminRoom[]>([])
  const [history, setHistory] = useState<GameHistory[]>([])
  const [announcement, setAnnouncement] = useState('')
  const [annText, setAnnText] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const handleLogin = async () => {
    try {
      const res = await fetch(getBase() + '/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (data.ok) {
        setToken(data.token)
        try { sessionStorage.setItem('rs_admin_token', data.token) } catch {}
        setLoginError('')
      } else {
        setLoginError('密码错误')
      }
    } catch {
      setLoginError('无法连接服务器')
    }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      const headers = { 'Authorization': 'Bearer ' + token }
      const [sRes, rRes, hRes] = await Promise.all([
        fetch(getBase() + '/api/admin/stats', { headers }),
        fetch(getBase() + '/api/admin/rooms', { headers }),
        fetch(getBase() + '/api/admin/history', { headers }),
      ])
      const sData = await sRes.json()
      const rData = await rRes.json()
      const hData = await hRes.json()
      if (sData.ok) { setStats(sData.stats); setAnnouncement(sData.stats.announcement); setAnnText(sData.stats.announcement) }
      if (rData.ok) setRooms(rData.rooms || [])
      if (hData.ok) setHistory(hData.history || [])
    } catch {
      setMsg('加载失败')
    }
    setLoading(false)
  }

  useEffect(() => {
    if (token) loadData()
    // 每10秒自动刷新
    const t = token ? setInterval(loadData, 10000) : null
    return () => { if (t) clearInterval(t) }
  }, [token])

  const saveAnnouncement = async () => {
    try {
      const res = await fetch(getBase() + '/api/admin/announcement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ text: annText }),
      })
      const data = await res.json()
      setMsg(data.ok ? '公告已发布 ✅' : '发布失败')
      if (data.ok) { setAnnouncement(data.announcement); setAnnText(data.announcement) }
    } catch {
      setMsg('发布失败')
    }
  }

  // ===== 登录页 =====
  if (!token) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900 p-4">
        <Card className="w-full max-w-sm bg-slate-800 border-slate-700">
          <CardContent className="p-6 space-y-4">
            <div className="text-center">
              <Shield className="w-12 h-12 text-indigo-400 mx-auto mb-2" />
              <h1 className="text-lg font-bold text-white">绒兽杀 · 运营后台</h1>
              <p className="text-xs text-slate-500 mt-1">请输入管理密码</p>
            </div>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="管理密码" className="bg-slate-900 border-slate-600 text-white" />
            {loginError && <p className="text-xs text-red-400">{loginError}</p>}
            <Button onClick={handleLogin} className="w-full bg-indigo-600 hover:bg-indigo-700">进入后台</Button>
            <Button variant="ghost" onClick={onBack} className="w-full text-slate-400">返回游戏</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ===== 看板 =====
  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white overflow-hidden">
      <header className="shrink-0 px-4 py-3 border-b border-slate-700 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-slate-400">
          <ArrowLeft className="w-4 h-4 mr-1" />返回
        </Button>
        <h1 className="text-base font-bold flex items-center gap-2">
          <Shield className="w-4 h-4 text-indigo-400" />绒兽杀 · 运营后台
        </h1>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}
          className="border-slate-600 text-slate-400">
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />刷新
        </Button>
      </header>

      <main className="flex-1 overflow-auto p-4 space-y-4">
        {msg && <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300">{msg}</div>}

        {/* 统计 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<Globe className="w-4 h-4" />} label="活跃房间" value={stats?.activeRooms ?? '-'} color="text-indigo-400" />
          <StatCard icon={<Users className="w-4 h-4" />} label="在线人数" value={stats?.totalPlayers ?? '-'} color="text-emerald-400" />
          <StatCard icon={<Gamepad2 className="w-4 h-4" />} label="总对局" value={stats?.totalGames ?? '-'} color="text-amber-400" />
          <StatCard icon={<Gamepad2 className="w-4 h-4" />} label="24小时对局" value={stats?.last24hGames ?? '-'} color="text-purple-400" />
        </div>

        {/* 公告管理 */}
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-bold flex items-center gap-2"><Megaphone className="w-4 h-4 text-amber-400" />公告管理</h3>
            <div className="flex gap-2">
              <Input value={annText} onChange={(e) => setAnnText(e.target.value)} maxLength={200}
                placeholder="输入公告内容（前台显示）" className="flex-1 bg-slate-900 border-slate-600 text-white" />
              <Button onClick={saveAnnouncement} className="bg-amber-600 hover:bg-amber-700 shrink-0">发布</Button>
            </div>
            {announcement && <p className="text-[10px] text-slate-500">当前公告：{announcement}</p>}
          </CardContent>
        </Card>

        {/* 房间列表 */}
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-bold flex items-center gap-2"><Globe className="w-4 h-4 text-indigo-400" />在线房间（{rooms.length}）</h3>
            {rooms.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-3">暂无在线房间</p>
            ) : (
              <div className="space-y-1.5">
                {rooms.map((r) => (
                  <div key={r.roomId} className="flex items-center gap-2 bg-slate-900/50 rounded px-2 py-1.5 text-xs">
                    <span className="font-mono text-slate-300">{r.roomId}</span>
                    <span className="text-slate-400">{r.hostName}</span>
                    <span className="text-slate-500">{r.playerCount}/{r.maxPlayers}</span>
                    <span className={r.isPublic ? 'text-emerald-400' : 'text-amber-400'}>
                      {r.isPublic ? '公开' : '私密'}
                    </span>
                    {r.hasPassword && <Lock className="w-3 h-3 text-amber-500" />}
                    <span className="ml-auto text-[10px] text-slate-600">
                      {new Date(r.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 对局历史 */}
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-bold flex items-center gap-2"><Gamepad2 className="w-4 h-4 text-amber-400" />对局历史（{history.length}）</h3>
            {history.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-3">暂无对局记录</p>
            ) : (
              <div className="space-y-1.5">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-900/50 rounded px-2 py-1.5 text-xs">
                    <span className="font-mono text-slate-300">{h.roomId}</span>
                    <span className="text-slate-400">{h.hostName}</span>
                    <span className="text-slate-500">{h.playerCount}人</span>
                    <span className={h.isPublic ? 'text-emerald-400' : 'text-amber-400'}>{h.isPublic ? '公开' : '私密'}</span>
                    <span className="ml-auto text-[10px] text-slate-600">
                      {new Date(h.startedAt).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: ReactNode; label: string; value: string | number; color: string }) {
  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardContent className="p-3">
        <div className={`flex items-center gap-1.5 text-xs ${color}`}>{icon}{label}</div>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
      </CardContent>
    </Card>
  )
}
