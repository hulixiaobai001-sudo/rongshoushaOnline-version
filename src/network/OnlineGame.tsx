import { useState, useEffect } from 'react'
import { useGameStore } from '@/store/gameStore'
import { getHeroById } from '@/data/heroData'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Map, MessageSquare, ChevronUp, ChevronDown,
  Footprints, Swords, Zap, Eye, ArrowLeft,
  Check, Clock, AlertCircle
} from 'lucide-react'
import { LoadingScreen } from './LoadingScreen'

interface OnlineGameProps {
  isHost: boolean
  debugMode: boolean
  onLeave: () => void
}

export function OnlineGame({ isHost, debugMode, onLeave }: OnlineGameProps) {
  const [loading, setLoading] = useState(true)
  const [actionOpen, setActionOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [allReady, setAllReady] = useState(false)
  const [phase] = useState<'investigate' | 'action' | 'move' | 'vote'>('investigate')
  const [popup, setPopup] = useState<{ title: string; desc: string } | null>(null)

  const { players, locations, round } = useGameStore()

  // 调试模式：空壳玩家自动准备
  useEffect(() => {
    if (!loading && debugMode && !allReady) {
      const timer = setTimeout(() => {
        setReady(true)
        // 模拟其他空壳玩家陆续准备
        let count = 0
        const interval = setInterval(() => {
          count++
          if (count >= 3) {
            clearInterval(interval)
            setAllReady(true)
          }
        }, 600)
      }, 800)
      return () => clearTimeout(timer)
    }
  }, [loading, debugMode, allReady])

  const showComingSoon = (title: string) => {
    setPopup({ title, desc: '此功能正在开发中，敬请期待 🦊' })
  }

  // 加载完成
  if (loading) {
    return <LoadingScreen debugMode={debugMode} onComplete={() => setLoading(false)} />
  }

  // 本地用主持人模式时直接用真人玩家
  const currentPlayer = players[0]
  const hero = currentPlayer?.heroId ? getHeroById(currentPlayer.heroId) : null
  const sameLocationPlayers = currentPlayer
    ? players.filter((p) => p.id !== currentPlayer.id && p.locationId === currentPlayer.locationId && p.status === 'alive')
    : []

  // 当前阶段的中文名
  const phaseName: Record<string, string> = {
    investigate: '侦查阶段',
    action: '行动阶段',
    move: '移动阶段',
    vote: '投票阶段',
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white">
      {/* 顶部状态栏 */}
      <header className="px-3 py-2 border-b border-slate-700 flex items-center gap-2 shrink-0 bg-slate-800/50">
        <Button variant="ghost" size="sm" onClick={onLeave}
          className="h-7 px-1.5 text-slate-400 hover:text-white hover:bg-slate-800 shrink-0">
          <ArrowLeft className="w-3.5 h-3.5" />
        </Button>
        <Badge variant="outline" className="text-[10px] font-mono text-slate-300 border-slate-600">
          {round ? `第 ${round} 轮` : '准备中'}
        </Badge>
        <Badge className="text-[10px] bg-indigo-600">{phaseName[phase] || '游戏中'}</Badge>
        <div className="flex-1" />
        {isHost && <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-700">房主</Badge>}
        {debugMode && <Badge className="text-[10px] bg-amber-600">调试</Badge>}
      </header>

      {/* 准备阶段 */}
      {!allReady && (
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm bg-slate-800 border-slate-700">
            <CardContent className="p-6 text-center space-y-4">
              <Clock className="w-12 h-12 text-emerald-400 mx-auto" />
              <h3 className="text-base font-bold text-white">准备就绪</h3>
              <p className="text-xs text-slate-400">
                请确认已准备好开始游戏
              </p>

              {/* 玩家准备列表 */}
              <div className="space-y-1.5 text-left">
                {players.slice(0, 8).map((p, i) => {
                  const isBot = p.id.startsWith('bot_')
                  const isReady = isBot || (i === 0 && ready)
                  return (
                    <div key={p.id} className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm ${
                      isReady ? 'bg-emerald-900/20' : 'bg-slate-900/30'
                    }`}>
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold shrink-0">
                        {i + 1}
                      </span>
                      <span className={i === 0 ? 'text-amber-400 font-medium' : 'text-slate-300'}>
                        {i === 0 ? '你' : isBot ? `空壳${p.id.slice(-1)}` : `玩家${i + 1}`}
                      </span>
                      {isBot && <span className="text-[9px] text-amber-600/60">空壳</span>}
                      <div className="flex-1" />
                      {isReady ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Clock className="w-4 h-4 text-slate-600" />
                      )}
                    </div>
                  )
                })}
              </div>

              {!ready ? (
                <Button onClick={() => setReady(true)} className="w-full bg-emerald-600 hover:bg-emerald-700">
                  我准备好了
                </Button>
              ) : !allReady ? (
                <p className="text-xs text-amber-400">等待其他玩家准备中...</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 游戏主界面 */}
      {allReady && (
        <>
          <main className="flex-1 flex flex-col lg:flex-row gap-2 p-2 min-h-0 overflow-hidden">
            {/* 左侧：大地图 */}
            <Card className="flex-1 flex flex-col min-h-[200px] bg-slate-800 border-slate-700">
              <CardContent className="flex-1 p-2">
                {locations.length > 0 ? (
                  <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                    {/* 连线 */}
                    {locations.map((loc) =>
                      loc.connectedTo.map((connId) => {
                        if (connId <= loc.id) return null
                        const target = locations.find((l) => l.id === connId)
                        if (!target) return null
                        return (
                          <line key={`${loc.id}_${connId}`}
                            x1={loc.x} y1={loc.y} x2={target.x} y2={target.y}
                            stroke="#334155" strokeWidth="0.6" />
                        )
                      })
                    )}
                    {/* 节点 */}
                    {locations.map((loc, i) => {
                      const locPlayers = players.filter((p) => p.locationId === loc.id && p.status === 'alive')
                      return (
                        <g key={loc.id}>
                          <circle cx={loc.x} cy={loc.y} r={4}
                            fill={locPlayers.length > 0 ? '#475569' : '#334155'}
                            stroke={locPlayers.some((p) => p.id === currentPlayer?.id) ? '#6366f1' : '#475569'}
                            strokeWidth="0.8" />
                          <text x={loc.x} y={loc.y + 7} textAnchor="middle" fontSize="2.8" fill="#94a3b8"
                            style={{ pointerEvents: 'none', userSelect: 'none' }}>
                            {i + 1}
                          </text>
                          <text x={loc.x} y={loc.y - 6} textAnchor="middle" fontSize="2.4" fill="#64748b"
                            style={{ pointerEvents: 'none', userSelect: 'none' }}>
                            {loc.name.length > 4 ? loc.name.slice(0, 4) + '..' : loc.name}
                          </text>
                          {locPlayers.length > 0 && (
                            <text x={loc.x + 5} y={loc.y - 4} fontSize="2.5" fill="#818cf8"
                              fontWeight="bold" style={{ pointerEvents: 'none' }}>
                              {locPlayers.length}
                            </text>
                          )}
                        </g>
                      )
                    })}
                    {/* 侦查阶段全图暴露提示 */}
                    {phase === 'investigate' && (
                      <rect x="25" y="2" width="50" height="6" rx="2" fill="#6366f1" opacity="0.15" />
                    )}
                  </svg>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <Map className="w-10 h-10 text-slate-700" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 右侧面板 */}
            <div className="w-full lg:w-72 shrink-0 flex flex-col gap-2">
              {/* 右上：小地图 + 附近玩家 */}
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-400 font-medium">
                      📍 {locations.find((l) => l.id === currentPlayer?.locationId)?.name || '未知'}
                    </span>
                    <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-slate-600 text-slate-400"
                      onClick={() => showComingSoon('侦查/行动/追踪面板')}>
                      侦查 · 行动 · 追踪 ▸
                    </Badge>
                  </div>
                  {/* 附近玩家 */}
                  <div className="space-y-1">
                    {sameLocationPlayers.length > 0 ? (
                      sameLocationPlayers.map((p) => (
                        <div key={p.id} className="flex items-center gap-1.5 text-[11px] text-slate-300 bg-slate-900/50 rounded px-1.5 py-1">
                          <div className="w-3.5 h-3.5 rounded-full bg-indigo-500 text-[8px] flex items-center justify-center text-white font-bold">
                            {players.indexOf(p) + 1}
                          </div>
                          <span className="truncate">{p.name}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-slate-600 text-center py-2">附近没有其他玩家</p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => showComingSoon('区域聊天')}
                    className="w-full mt-1 h-6 text-[10px] text-slate-400 hover:text-white">
                    <MessageSquare className="w-3 h-3 mr-1" />区域聊天
                  </Button>
                </CardContent>
              </Card>

              {/* 右下：角色信息 */}
              <Card className="bg-slate-800 border-slate-700 flex-1">
                <CardContent className="p-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ backgroundColor: hero?.color || '#6366f1' }}>
                      {currentPlayer?.name?.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">
                        {currentPlayer?.name || '未知'}
                        {hero && <span className="text-[10px] text-slate-400 ml-1">({hero.name})</span>}
                      </p>
                      <p className="text-[9px] text-slate-500">
                        {hero?.title || ''}
                      </p>
                    </div>
                  </div>
                  {/* 技能 */}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {hero && hero.skills.length > 0 ? (
                      hero.skills.map((skill) => (
                        <Button key={skill.id} variant="outline" size="sm"
                          onClick={() => setPopup({ title: skill.name, desc: skill.description })}
                          className="h-6 text-[10px] px-2 border-slate-600 text-slate-300 hover:bg-slate-700">
                          {skill.name}
                        </Button>
                      ))
                    ) : (
                      <p className="text-[10px] text-slate-600">暂无技能</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>

          {/* 底部操作拉取条 */}
          <div className="border-t border-slate-700 bg-slate-800/80">
            <Button variant="ghost" onClick={() => setActionOpen(!actionOpen)}
              className="w-full h-8 text-xs text-slate-300 hover:text-white rounded-none flex items-center justify-center gap-1">
              {actionOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              {actionOpen ? '收起' : '展开行动面板'}
            </Button>

            {actionOpen && (
              <div className="px-3 pb-3 space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { icon: Footprints, label: '移动', key: 'move', desc: '移动到相邻地点' },
                    { icon: Swords, label: '攻击', key: 'attack', desc: '攻击同地点玩家（杀手限定）' },
                    { icon: Zap, label: '技能', key: 'skill', desc: '使用英雄技能' },
                    { icon: Eye, label: '侦查', key: 'investigate', desc: '查看周围情况' },
                  ].map((action) => (
                    <Button key={action.key} variant="outline"
                      className="h-16 flex flex-col items-center justify-center gap-1 border-slate-600 hover:border-indigo-500 hover:bg-slate-700"
                      onClick={() => {
                        const isActionPhase = phase.startsWith('action') || phase.startsWith('move')
                        if (!isActionPhase && action.key !== 'investigate') {
                          setPopup({ title: '非行动阶段', desc: '当前不是行动阶段，无法执行此操作' })
                          return
                        }
                        setPopup({
                          title: action.label,
                          desc: `${action.desc}\n\n确定要执行此行动吗？`
                        })
                      }}>
                      <action.icon className="w-5 h-5 text-slate-300" />
                      <span className="text-[10px] text-slate-400">{action.label}</span>
                    </Button>
                  ))}
                </div>
                <div className="bg-slate-900/50 rounded-lg p-2 text-center">
                  <p className="text-[10px] text-slate-500">
                    {phase === 'move' ? '当前为移动阶段，可选择目标地点' : '点击操作按钮执行行动'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* 弹窗 - 敬请期待 / 信息提示 */}
      {popup && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setPopup(null)}>
          <Card className="bg-slate-800 border-slate-700 w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}>
            <CardContent className="p-5 text-center space-y-3">
              {popup.title === '敬请期待' || popup.desc.includes('敬请期待') ? (
                <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
              ) : (
                <Zap className="w-10 h-10 text-indigo-400 mx-auto" />
              )}
              <h3 className="text-base font-bold text-white">{popup.title}</h3>
              <p className="text-sm text-slate-300 whitespace-pre-line">{popup.desc}</p>
              <Button onClick={() => setPopup(null)} className="mt-2 bg-indigo-600 hover:bg-indigo-700 w-full">
                知道了
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
