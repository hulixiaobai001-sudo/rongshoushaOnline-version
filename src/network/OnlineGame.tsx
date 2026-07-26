import { useState, useEffect } from 'react'
import { useGameStore } from '@/store/gameStore'
import { getHeroById, HERO_POOL } from '@/data/heroData'
import { getReachableLocations } from '@/data/gameData'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { HeroSkill } from '@/types/hero'
import {
  Settings, BookOpen, Footprints, Zap,
  MapPin, Users,
  Check, X, AlertCircle, ChevronUp, ChevronDown,
  Skull, Heart,
  Navigation, Sparkles
} from 'lucide-react'
import { LoadingScreen } from './LoadingScreen'

// ─── 弹窗类型 ────────────────────────────────────
type PopupType = 'confirm' | 'info' | 'settings' | 'rules'

interface PopupState {
  type: PopupType
  title?: string
  desc?: string
  onConfirm?: () => void
  confirmText?: string
}

// ─── 游戏模式状态 ─────────────────────────────────
type GameInteraction = 'idle' | 'moving' | 'skill_target'

// ─── 周/天/阶段 映射 ──────────────────────────────
const PHASE_DAY_MAP: Record<string, number> = {
  action1: 1, move1: 1,
  action2: 2, move2: 2,
  action3: 3, move3: 3,
  action4: 4, move4: 4,
}

const PHASE_LABEL: Record<string, string> = {
  action1: '行动阶段①', move1: '移动阶段',
  action2: '行动阶段②', move2: '移动阶段',
  action3: '行动阶段③', move3: '移动阶段',
  action4: '行动阶段④', move4: '移动阶段',
  death_report: '死亡播报',
  vote: '投票阶段', vote_result: '投票结果',
  end: '游戏结束',
  setup: '准备中', identity: '身份发布', start: '角色放置',
}

// ─── 获取移动阶段技能的提示 ──────────────────────
const MOVE_SKILL_IDS = ['zhuxun_double_move', 'fengming_teleport']

// ═══════════════════════════════════════════════════
//  OnlineGame 主组件
// ═══════════════════════════════════════════════════
interface OnlineGameProps {
  isHost: boolean
  debugMode: boolean
  botNames?: string[]
  onLeave: () => void
}

export function OnlineGame({ debugMode, botNames, onLeave }: OnlineGameProps) {
  const store = useGameStore()
  const {
    phase, round, players, locations,
    movePlayer, nextPhase,
    activateKungFu, activateTeleport, activateDoubleMove, applyHalt,
    usedSkills,
  } = store

  // ── 本地状态 ──
  const [loading, setLoading] = useState(true)
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [interaction, setInteraction] = useState<GameInteraction>('idle')
  const [selectedSkill, setSelectedSkill] = useState<HeroSkill | null>(null)
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [skillsOpen, setSkillsOpen] = useState(false)

  // 当前玩家（开发阶段固定为 players[0]）
  const currentPlayer = players[0]
  const hero = currentPlayer?.heroId ? getHeroById(currentPlayer.heroId) : null

  // ── 阶段信息 ──
  const phaseLabel = PHASE_LABEL[phase] || phase
  const day = PHASE_DAY_MAP[phase] ?? null
  const isMovePhase = phase.startsWith('move')
  const isGameOver = phase === 'end'

  // 存活/死亡
  const alivePlayers = players.filter(p => p.status === 'alive')
  const deadPlayers = players.filter(p => p.status === 'dead')

  // 同地点玩家
  const sameLocationPlayers = currentPlayer
    ? players.filter(p => p.id !== currentPlayer.id && p.locationId === currentPlayer.locationId && p.status === 'alive')
    : []
  const allAliveOthers = players.filter(p => p.id !== currentPlayer?.id && p.status === 'alive')

  // 可到达地点
  const reachableLocations = currentPlayer
    ? getReachableLocations(locations, currentPlayer.locationId, 1)
    : []

  // ── 加载完成 ──
  useEffect(() => {
    if (loading && debugMode) {
      const t = setTimeout(() => setLoading(false), 1200)
      return () => clearTimeout(t)
    }
  }, [loading, debugMode])

  // ── 点击的地点信息 ──
  const infoLocationId = selectedLocationId || currentPlayer?.locationId || ''
  const infoLocation = locations.find(l => l.id === infoLocationId)
  const infoPlayers = infoLocation
    ? players.filter(p => p.locationId === infoLocation.id && p.status === 'alive')
    : []

  // ── 重置交互 ──
  const resetInteraction = () => {
    setInteraction('idle')
    setSelectedSkill(null)
    setSelectedLocationId(null)
  }

  // ── 弹窗辅助 ──
  const confirm = (title: string, onConfirm: () => void, confirmText = '确定') =>
    setPopup({ type: 'confirm', title, onConfirm, confirmText })
  const info = (title: string, desc: string) =>
    setPopup({ type: 'info', title, desc })
  const showSettings = () => setPopup({ type: 'settings' })
  const showRules = () => setPopup({ type: 'rules' })

  // ── 移动 ──
  const handleMoveClick = () => {
    if (!isMovePhase) { info('不在移动阶段', '当前不是移动阶段，无法移动'); return }
    if (!currentPlayer) return
    if (reachableLocations.length === 0) { info('无处可去', '当前地点没有相连的道路'); return }
    setInteraction('moving')
    setSkillsOpen(false)
  }

  const handleLocationSelect = (locId: string) => {
    if (interaction === 'idle') {
      // 普通模式：点击查看地点信息
      setSelectedLocationId(locId === selectedLocationId ? null : locId)
      return
    }

    if (interaction === 'moving') {
      if (!currentPlayer) return
      const currentLoc = locations.find(l => l.id === currentPlayer.locationId)
      const targetLoc = locations.find(l => l.id === locId)
      if (!currentLoc || !targetLoc) return

      if (!currentLoc.connectedTo.includes(locId)) {
        info('无法到达', `从 ${currentLoc.name} 无法到达 ${targetLoc.name}`)
        return
      }

      confirm(`移动到 ${targetLoc.name}？`, () => {
        movePlayer(currentPlayer.id, locId)
        setSelectedLocationId(locId)
        resetInteraction()
        info('移动完成', `已到达 ${targetLoc.name}`)
      })
      return
    }

    if (interaction === 'skill_target' && selectedSkill) {
      // 如果是 location 类型的目标（如大力射门选相邻地点）
      handleSkillUse(selectedSkill, undefined, locId)
    }
  }

  // ── 技能系统 ──
  const handleSkillClick = (skill: HeroSkill) => {
    // 检查是否为移动阶段技能
    if (isMovePhase && MOVE_SKILL_IDS.includes(skill.id)) {
      // 移动阶段技能在左下角点击时触发
      handleMoveSkill(skill)
      return
    }

    // 检查阶段
    if (!skill.usablePhase.some(p => phase.startsWith(p) || (p === 'vote' && phase === 'vote'))) {
      info('无法使用', `【${skill.name}】只能在 ${skill.usablePhase.join(', ')} 阶段使用`)
      return
    }

    // 检查使用次数
    if (skill.limit === 'once_per_game') {
      const usedSkillIds = usedSkills[currentPlayer?.id || ''] || []
      if (usedSkillIds.includes(skill.id)) {
        info('已使用', `【${skill.name}】每局仅能使用一次`)
        return
      }
    }

    // 根据目标类型处理
    switch (skill.targetType) {
      case 'self':
        confirm(`使用【${skill.name}】？\n${skill.description}`, () => handleSkillUse(skill))
        break
      case 'same_location_player':
        if (sameLocationPlayers.length === 0) {
          info('无目标', '附近没有其他玩家')
          return
        }
        setSelectedSkill(skill)
        setInteraction('skill_target')
        setSkillsOpen(false)
        break
      case 'any_player':
        if (allAliveOthers.length === 0) {
          info('无目标', '没有可选的存活玩家')
          return
        }
        setSelectedSkill(skill)
        setInteraction('skill_target')
        setSkillsOpen(false)
        break
      case 'adjacent_location':
        setSelectedSkill(skill)
        setInteraction('skill_target')
        setSkillsOpen(false)
        break
      default:
        confirm(`使用【${skill.name}】？`, () => handleSkillUse(skill))
    }
  }

  const handleMoveSkill = (skill: HeroSkill) => {
    confirm(`使用【${skill.name}】？\n${skill.description}`, () => {
      handleSkillUse(skill)
    })
  }

  const handleSkillUse = (skill: HeroSkill, targetPlayerId?: string, targetLocationId?: string) => {
    const playerId = currentPlayer?.id || ''
    const skillName = skill.name

    // 执行技能效果
    switch (skill.id) {
      // ── 年糕：功夫 ──
      case 'niangao_kungfu':
        activateKungFu(playerId)
        info('功夫已激活', '本行动阶段内任何攻击都将被反击！')
        break

      // ── 西凌：影杀 ──
      case 'xiling_kill_same_room':
        if (targetPlayerId) {
          store.killPlayer(targetPlayerId, playerId)
          const target = players.find(p => p.id === targetPlayerId)
          info('影杀成功', `对 ${target?.name || '目标'} 发起影杀！`)
        }
        break

      // ── 科雄/天燚：探查 ──
      case 'kexiong_investigate':
      case 'tianyi_investigate_same_room':
        if (targetPlayerId) {
          const target = players.find(p => p.id === targetPlayerId)
          const realIdentity = target?.identity === 'killer' ? '🔴 杀手' : '🔵 平民'
          info('身份查验', `${target?.name} 的真实身份是：${realIdentity}`)
        }
        break

      // ── 言浊：过肩摔 ──
      case 'yanzhuo_suplex':
        if (targetPlayerId) {
          applyHalt(targetPlayerId)
          const target = players.find(p => p.id === targetPlayerId)
          info('过肩摔成功', `${target?.name} 下个移动阶段无法行动`)
        }
        break

      // ── 白野：追踪香囊 ──
      case 'baiye_track':
        if (targetPlayerId) {
          store.setTrackedPlayer(targetPlayerId)
          const target = players.find(p => p.id === targetPlayerId)
          info('追踪已标记', `已标记 ${target?.name}，将追踪其后续行动`)
        }
        break

      // ── 夜羽：潜伏 ──
      case 'yeyu_stealth':
        applyHalt(playerId)
        info('潜伏状态', '进入隐匿状态，将跳过下一个行动阶段')
        break

      // ── 竹隼：疾行 ──
      case 'zhuxun_double_move':
        activateDoubleMove(playerId)
        info('疾行已激活', '本移动阶段可连续移动两次')
        break

      // ── 冯明：传送 ──
      case 'fengming_teleport':
        activateTeleport(playerId)
        info('传送已激活', '下次移动可到达任意地点')
        break

      // ── 张扬：断路 ──
      case 'zhangyang_cut_connection':
        info('断路', '请选择两个地点切断道路（待实现）')
        break

      // ── 王力：大力射门 ──
      case 'wangli_big_shot':
        if (targetLocationId) {
          const targetLoc = locations.find(l => l.id === targetLocationId)
          info('大力射门', `${targetLoc?.name} 内的所有玩家下回合无法行动`)
          // 对目标地点的所有玩家施加 halt
          const locPlayers = players.filter(p => p.locationId === targetLocationId && p.status === 'alive')
          locPlayers.forEach(p => applyHalt(p.id))
        }
        break

      // ── 江枫：侦察无人机 ──
      case 'jiangfeng_drone':
        info('侦察无人机', '在当前地点放置无人机，开始记录经过人员')
        break

      default:
        info('技能已使用', `【${skillName}】${skill.description}`)
    }

    resetInteraction()
    setSkillsOpen(false)
  }

  const handlePlayerTargetSelect = (targetId: string) => {
    if (!selectedSkill) return
    const target = players.find(p => p.id === targetId)
    confirm(`对 ${target?.name} 使用【${selectedSkill.name}】？`, () => {
      handleSkillUse(selectedSkill, targetId)
    })
  }

  // ── 准备 ──
  const handleReady = () => {
    if (isGameOver) {
      confirm('返回大厅？', () => onLeave())
      return
    }
    confirm('进入下一阶段？', () => {
      resetInteraction()
      nextPhase()
    }, '确认')
  }

  // ── 加载中 ──
  if (loading) {
    return <LoadingScreen debugMode={debugMode} botNames={botNames} onComplete={() => setLoading(false)} />
  }

  // ═══════════════════════════════════════════════════
  //  主界面渲染
  // ═══════════════════════════════════════════════════

  // 判断当前可用的英雄技能
  const availableSkills = hero?.skills.filter(s => {
    // 检查阶段
    const phaseOk = s.usablePhase.some(p => phase.startsWith(p) || (p === 'vote' && phase === 'vote'))
    // 检查次数
    const usedSkillIds = usedSkills[currentPlayer?.id || ''] || []
    const notUsed = s.limit === 'unlimited' || s.limit === 'once_per_round' || !usedSkillIds.includes(s.id)
    return phaseOk && notUsed
  }) || []

  // 判断是否为选目标模式
  const isTargetingMode = interaction === 'skill_target' && selectedSkill
  const isMoveMode = interaction === 'moving'

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white overflow-hidden">
      {/* ═══ 顶栏 ═══ */}
      <header className="shrink-0 px-3 py-2.5 bg-slate-800/80 border-b border-slate-700 flex items-center gap-2">
        {/* 左：周/天 + 阶段 */}
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="secondary" className="text-[10px] md:text-xs font-mono shrink-0 bg-slate-700 text-slate-200 border-slate-600">
            <Navigation className="w-3 h-3 mr-1 text-indigo-400" />
            第{round}周{day ? `·第${day}天` : ''}
          </Badge>
          <Badge className="text-[10px] md:text-xs bg-indigo-600 shrink-0">
            {phaseLabel}
          </Badge>
        </div>

        <div className="flex-1" />

        {/* 存活/死亡 */}
        <div className="flex items-center gap-1.5 mr-1">
          <span className="text-[10px] text-emerald-400 flex items-center gap-0.5">
            <Heart className="w-3 h-3" />
            {alivePlayers.length}
          </span>
          {deadPlayers.length > 0 && (
            <span className="text-[10px] text-red-400 flex items-center gap-0.5">
              <Skull className="w-3 h-3" />
              {deadPlayers.length}
            </span>
          )}
        </div>

        {/* 右：设置 + 规则 */}
        <button onClick={showSettings}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <Settings className="w-4 h-4" />
        </button>
        <button onClick={showRules}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
          <BookOpen className="w-4 h-4" />
        </button>
      </header>

      {/* ═══ 主内容区域 ═══ */}
      <main className="flex-1 flex flex-col min-h-0">
        {/* ── 投票阶段专用界面 ── */}
        {phase === 'vote' ? (
          <VoteSection
            phase={phase} round={round} day={day}
            phaseLabel={phaseLabel}
            players={players} currentPlayer={currentPlayer} hero={hero}
            alivePlayers={alivePlayers}
            usedSkills={usedSkills}
            store={store}
            onNextPhase={handleReady}
            onPopup={setPopup}
          />
        ) : phase === 'vote_result' ? (
          <VoteResultSection
            players={players} alivePlayers={alivePlayers}
            onNextPhase={handleReady}
          />
        ) : phase === 'death_report' ? (
          <DeathReportSection
            players={players} locations={locations} alivePlayers={alivePlayers}
            onNextPhase={handleReady}
          />
        ) : (<></>
        <div className="flex-1 p-2 min-h-0 relative">
          {locations.length > 0 ? (
            <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
              {/* ── 连线 ── */}
              {locations.map(loc =>
                loc.connectedTo.map(connId => {
                  if (connId <= loc.id) return null
                  const target = locations.find(l => l.id === connId)
                  if (!target) return null
                  const isHighlighted = isMoveMode && reachableLocations.some(r =>
                    (r.id === loc.id && currentPlayer?.locationId === target.id) ||
                    (r.id === target.id && currentPlayer?.locationId === loc.id)
                  )
                  return (
                    <line key={`${loc.id}_${connId}`}
                      x1={loc.x} y1={loc.y} x2={target.x} y2={target.y}
                      stroke={isHighlighted ? '#818cf8' : '#334155'}
                      strokeWidth={isHighlighted ? '1' : '0.6'}
                      strokeDasharray={isHighlighted ? '1,1' : 'none'}
                    />
                  )
                })
              )}

              {/* ── 地点 ── */}
              {locations.map(loc => {
                const locPlayers = players.filter(p => p.locationId === loc.id && p.status === 'alive')
                const isCurrentLoc = locPlayers.some(p => p.id === currentPlayer?.id)
                const isReachable = isMoveMode && reachableLocations.some(r => r.id === loc.id)
                const isClickable = isMoveMode ? isReachable : true

                return (
                  <g key={loc.id}
                    onClick={() => isClickable && handleLocationSelect(loc.id)}
                    style={{ cursor: isClickable ? 'pointer' : 'default' }}>
                    {/* 移动模式高亮 */}
                    {isReachable && (
                      <circle cx={loc.x} cy={loc.y} r={6.5}
                        fill="none" stroke="#818cf8" strokeWidth="1.2" opacity="0.7">
                        <animate attributeName="r" values="6;7;6" dur="1.5s" repeatCount="indefinite" />
                      </circle>
                    )}
                    {/* 技能目标高亮 */}
                    {isTargetingMode && selectedSkill?.targetType === 'adjacent_location' && (
                      <circle cx={loc.x} cy={loc.y} r={6.5}
                        fill="none" stroke="#f59e0b" strokeWidth="1.2" opacity="0.7" />
                    )}
                    {/* 地点圆圈 */}
                    <circle cx={loc.x} cy={loc.y} r={4.5}
                      fill={isCurrentLoc ? '#4f46e5' : locPlayers.length > 0 ? '#475569' : '#334155'}
                      stroke={isCurrentLoc ? '#818cf8' : isReachable ? '#818cf8' : isTargetingMode ? '#f59e0b' : '#475569'}
                      strokeWidth={isCurrentLoc || isReachable || isTargetingMode ? '1.5' : '0.8'}
                    />
                    {/* 地点名称 */}
                    <text x={loc.x} y={loc.y + 9} textAnchor="middle"
                      fontSize="3" fill={isCurrentLoc ? '#c7d2fe' : '#94a3b8'}
                      fontWeight={isCurrentLoc ? '700' : '500'}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {loc.name.length > 5 ? loc.name.slice(0, 5) + '..' : loc.name}
                    </text>
                    {/* 地点效果标记 */}
                    {loc.effect && loc.effect.type !== 'placeholder' && (
                      <text x={loc.x} y={loc.y + 12.5} textAnchor="middle"
                        fontSize="2.2" fill="#d97706" fontWeight="600"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {loc.effect.name}
                      </text>
                    )}
                    {/* 玩家图标 */}
                    {locPlayers.map((p, i) => {
                      const angle = (2 * Math.PI * i) / Math.max(locPlayers.length, 1) - Math.PI / 2
                      const px = loc.x + Math.cos(angle) * 7
                      const py = loc.y + Math.sin(angle) * 7
                      const isMe = p.id === currentPlayer?.id
                      const pHero = p.heroId ? getHeroById(p.heroId) : null
                      return (
                        <g key={p.id} style={{ cursor: isTargetingMode && selectedSkill?.targetType !== 'self' ? 'pointer' : 'default' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isTargetingMode) {
                              const canTarget = selectedSkill?.targetType === 'any_player' ||
                                (selectedSkill?.targetType === 'same_location_player' && sameLocationPlayers.some(sp => sp.id === p.id))
                              if (canTarget) handlePlayerTargetSelect(p.id)
                            }
                          }}>
                          <circle cx={px} cy={py} r={2.8}
                            fill={isMe ? '#818cf8' : pHero?.color || '#6366f1'}
                            stroke={isMe ? '#fff' : '#1e293b'} strokeWidth="0.5" />
                          <text x={px} y={py + 1} textAnchor="middle"
                            fontSize="2.8" fill="white" fontWeight="bold"
                            style={{ pointerEvents: 'none', userSelect: 'none' }}>
                            {players.indexOf(p) + 1}
                          </text>
                        </g>
                      )
                    })}
                  </g>
                )
              })}

              {/* 交互模式提示 */}
              {isMoveMode && (
                <text x={50} y={5} textAnchor="middle" fontSize="3.5" fill="#818cf8" fontWeight="600"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  选择高亮地点进行移动
                </text>
              )}
              {isTargetingMode && selectedSkill && (
                <text x={50} y={5} textAnchor="middle" fontSize="3.5" fill="#f59e0b" fontWeight="600"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  选择目标 — {selectedSkill.name}
                </text>
              )}
            </svg>
          ) : (
            <div className="h-full flex items-center justify-center">
              <MapPin className="w-10 h-10 text-slate-700" />
            </div>
          )}

          {/* 取消交互按钮 */}
          {(isMoveMode || isTargetingMode) && (
            <button onClick={resetInteraction}
              className="absolute top-3 right-3 bg-slate-800/90 backdrop-blur rounded-lg px-3 py-1.5
                         border border-slate-600 text-xs text-slate-300 flex items-center gap-1.5
                         hover:bg-slate-700 transition-colors z-10">
              <X className="w-3.5 h-3.5" />取消
            </button>
          )}
        </div>

        {/* ═══ 地点信息面板 ═══ */}
        <div className="shrink-0 px-3 py-2 bg-slate-800/60 border-t border-slate-700">
          {infoLocation ? (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-900/50 border border-indigo-700/50 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">
                    {infoLocation.name}
                  </span>
                  {infoLocation.id === currentPlayer?.locationId && (
                    <Badge className="text-[9px] h-4 bg-indigo-600/80 text-indigo-200 border-0">你在这里</Badge>
                  )}
                  {infoLocation.isBlocked && (
                    <Badge className="text-[9px] h-4 bg-red-600/80 text-red-200 border-0">封锁中</Badge>
                  )}
                </div>
                {infoLocation.effect && infoLocation.effect.type !== 'placeholder' && (
                  <p className="text-[11px] text-amber-400/90 mt-0.5">
                    <Sparkles className="w-3 h-3 inline mr-1" />
                    {infoLocation.effect.name} — {infoLocation.effect.description}
                  </p>
                )}
                {infoPlayers.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    <Users className="w-3 h-3 text-slate-500" />
                    {infoPlayers.map(p => {
                      const isMe = p.id === currentPlayer?.id
                      const pHero = p.heroId ? getHeroById(p.heroId) : null
                      return (
                        <Badge key={p.id} variant="outline"
                          className={`text-[10px] h-5 px-1.5 gap-1 ${isMe ? 'border-indigo-600 text-indigo-300 bg-indigo-900/30' : 'border-slate-600 text-slate-300'}`}>
                          <span className="w-3.5 h-3.5 rounded-full text-[7px] font-bold flex items-center justify-center shrink-0"
                            style={{ backgroundColor: pHero?.color || '#6366f1' }}>
                            {players.indexOf(p) + 1}
                          </span>
                          {isMe ? '你' : p.name}
                        </Badge>
                      )
                    })}
                  </div>
                )}
                {infoPlayers.length === 0 && (
                  <p className="text-[11px] text-slate-500 mt-0.5">没有其他玩家在此地点</p>
                )}
              </div>
              {selectedLocationId && selectedLocationId !== currentPlayer?.locationId && (
                <button onClick={() => setSelectedLocationId(null)}
                  className="text-[10px] text-slate-500 hover:text-white shrink-0 mt-1">
                  返回当前位置
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">加载中...</p>
          )}
        </div>
      </>}
      </main>

      {/* ═══ 底部操作栏 ═══ */}
      <footer className="shrink-0 border-t border-slate-700 bg-slate-800/90">
        <div className="flex items-center gap-2 px-3 py-2">
          {/* 左：技能区（移动阶段技能 + 可用技能） */}
          <div className="flex-1 min-w-0">
            {availableSkills.length > 0 && !isMoveMode && !isTargetingMode && (
              <div className="flex flex-wrap items-center gap-1">
                <button onClick={() => setSkillsOpen(!skillsOpen)}
                  className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 px-1.5 py-1 rounded hover:bg-slate-700/50 transition-colors">
                  <Zap className="w-3 h-3" />
                  技能
                  {skillsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                </button>
                {/* 显示前2个技能快捷按钮 */}
                {!skillsOpen && availableSkills.slice(0, 2).map(s => (
                  <button key={s.id} onClick={() => handleSkillClick(s)}
                    className="text-[10px] px-2 py-1 rounded bg-slate-700/60 text-slate-300 hover:bg-slate-600 border border-slate-600 transition-colors">
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            {skillsOpen && (
              <div className="flex flex-wrap gap-1.5">
                {availableSkills.map(s => (
                  <button key={s.id} onClick={() => { handleSkillClick(s); setSkillsOpen(false) }}
                    className="text-[10px] px-2 py-1 rounded bg-indigo-900/40 text-indigo-300 hover:bg-indigo-800/60 border border-indigo-700/50 transition-colors">
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 中：移动按钮 */}
          {isMovePhase && !isMoveMode && !isTargetingMode && (
            <button onClick={handleMoveClick}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium transition-colors">
              <Footprints className="w-3.5 h-3.5" />
              移动
            </button>
          )}

          {/* 右：准备按钮 */}
          <button onClick={handleReady}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0
              ${isGameOver
                ? 'bg-slate-600 hover:bg-slate-500 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}>
            <Check className="w-3.5 h-3.5" />
            {isGameOver ? '返回大厅' : '准备'}
          </button>
        </div>
      </footer>

      {/* ═══ 弹窗 ═══ */}
      {popup && <PopupOverlay popup={popup} onClose={() => setPopup(null)}
        players={players} currentPhase={phase} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════
//  投票阶段组件
// ═══════════════════════════════════════════════════
function VoteSection({ phase, round, day, phaseLabel, players, currentPlayer, hero, alivePlayers, usedSkills, store, onNextPhase, onPopup }: {
  phase: string; round: number; day: number | null; phaseLabel: string;
  players: any[]; currentPlayer: any; hero: any;
  alivePlayers: any[]; usedSkills: Record<string, string[]>;
  store: any; onNextPhase: () => void; onPopup: (p: any) => void;
}) {
  const [voteTarget, setVoteTarget] = useState<string | null>(null)
  const [gunshotTarget, setGunshotTarget] = useState<string | null>(null)

  const isLiLongxiang = hero?.id === 'lilongxiang'
  const gunShotUsed = isLiLongxiang && (usedSkills[currentPlayer?.id || ''] || []).includes('lilongxiang_gunshot')

  const handleConfirmVote = () => {
    if (voteTarget) {
      store.submitVotes([{ voterId: currentPlayer.id, targetId: voteTarget }])
    }
    onNextPhase()
  }

  return (
    <div className="flex-1 flex flex-col p-3 gap-3 overflow-auto">
      <p className="text-xs text-slate-400 text-center">点击选择你要投票淘汰的玩家</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {alivePlayers.map((p: any) => {
          const pHero = p.heroId ? getHeroById(p.heroId) : null
          const isSelected = voteTarget === p.id
          const isMe = p.id === currentPlayer?.id
          return (
            <button key={p.id} onClick={() => !isMe && setVoteTarget(isSelected ? null : p.id)}
              disabled={isMe}
              className={`relative p-3 rounded-xl border transition-all text-left ${
                isSelected
                  ? 'bg-red-900/40 border-red-500 ring-1 ring-red-500'
                  : isMe
                    ? 'bg-slate-800/30 border-slate-700 opacity-50'
                    : 'bg-slate-800 border-slate-700 hover:border-indigo-500'
              }`}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ backgroundColor: pHero?.color || '#6366f1' }}>
                  {pHero?.name?.charAt(0) || '?'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{isMe ? '你' : p.name}</p>
                  {pHero && <p className="text-[10px] text-slate-400">{pHero.name}</p>}
                </div>
              </div>
              {isSelected && (
                <div className="absolute top-1 right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* 枪毙技能（李龙祥） */}
      {isLiLongxiang && !gunShotUsed && (
        <div className="bg-slate-800/60 border border-red-800/50 rounded-xl p-3">
          <p className="text-xs font-bold text-red-400 mb-2">🔫 枪毙 — 选择处决目标</p>
          <div className="flex flex-wrap gap-1.5">
            {alivePlayers.filter((p: any) => p.id !== currentPlayer?.id).map((p: any) => {
              const isTarget = gunshotTarget === p.id
              const pHero = p.heroId ? getHeroById(p.heroId) : null
              return (
                <button key={p.id} onClick={() => setGunshotTarget(isTarget ? null : p.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors ${
                    isTarget
                      ? 'bg-red-700 border-red-500 text-white'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-red-500'
                  }`}>
                  {p.name} {pHero ? `(${pHero.name})` : ''}
                </button>
              )
            })}
          </div>
          {gunshotTarget && (
            <button onClick={() => { store.executeGunShot(currentPlayer.id, gunshotTarget); setGunshotTarget(null) }}
              className="mt-2 w-full py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-bold text-white transition-colors">
              🔫 执行枪决
            </button>
          )}
        </div>
      )}

      {/* 确认投票 */}
      <div className="flex gap-2 mt-auto pt-2">
        <button onClick={handleConfirmVote}
          className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed">
          {voteTarget ? `确认投票（${alivePlayers.find((p: any) => p.id === voteTarget)?.name}）` : '确认投票'}
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════
//  投票结果公示组件
// ═══════════════════════════════════════════════════
function VoteResultSection({ players, alivePlayers, onNextPhase }: {
  players: any[]; alivePlayers: any[]; onNextPhase: () => void;
}) {
  const deadPlayers = players.filter((p: any) => p.status === 'dead')
  const newlyDead = deadPlayers.filter((p: any) => p.isRevealed)
  const votedOut = newlyDead.slice(-3) // 最近死亡的玩家

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
      <div className="text-4xl">📊</div>
      <h2 className="text-lg font-bold text-white">投票结果</h2>
      {votedOut.length > 0 ? (
        <div className="space-y-2 w-full max-w-xs">
          {votedOut.map((p: any) => (
            <div key={p.id} className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-center">
              <p className="text-base font-bold text-white">{p.name}</p>
              <p className="text-xs text-slate-400">{p.identity === 'killer' ? '🔴 杀手' : '🔵 平民'}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">无人被投票出局</p>
      )}
      <p className="text-xs text-slate-500">存活 {alivePlayers.length} / {players.length}</p>
      <button onClick={onNextPhase}
        className="mt-2 px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors">
        进入下一轮
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════
//  死亡播报组件
// ═══════════════════════════════════════════════════
function DeathReportSection({ players, locations, alivePlayers, onNextPhase }: {
  players: any[]; locations: any[]; alivePlayers: any[]; onNextPhase: () => void;
}) {
  const deadPlayers = players.filter((p: any) => p.status === 'dead')
  // 本轮死亡的玩家（死亡但地点还没封锁的）
  const freshDead = deadPlayers.filter((p: any) => {
    const loc = locations.find((l: any) => l.id === p.locationId)
    return loc && !loc.isBlocked
  })

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
      <div className="text-4xl">💀</div>
      <h2 className="text-lg font-bold text-white">死亡播报</h2>
      {freshDead.length > 0 ? (
        <div className="space-y-2 w-full max-w-xs">
          {freshDead.map((p: any) => (
            <div key={p.id} className="bg-slate-800 border border-red-800/50 rounded-xl p-3 text-center">
              <p className="text-base font-bold text-white">{p.name}</p>
              <p className="text-xs text-slate-400">
                {p.identity === 'killer' ? '🔴 杀手' : '🔵 平民'}
                {' · '}
                {locations.find((l: any) => l.id === p.locationId)?.name || '未知地点'}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">本轮无人死亡</p>
      )}
      <p className="text-xs text-slate-500">存活 {alivePlayers.length} / {players.length}</p>
      <button onClick={onNextPhase}
        className="mt-2 px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors">
        进入投票阶段
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════
//  弹窗覆盖层
// ═══════════════════════════════════════════════════
function PopupOverlay({
  popup, onClose, players, currentPhase
}: {
  popup: PopupState
  onClose: () => void
  players: any[]
  currentPhase: string
}) {
  if (popup.type === 'settings') {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <Card className="bg-slate-800 border-slate-700 w-full max-w-sm max-h-[80vh]" onClick={e => e.stopPropagation()}>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-slate-400" />设置
              </h3>
              <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <Separator className="bg-slate-700" />
            <div className="space-y-3 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span>音效</span>
                <span className="text-slate-500 text-xs">开发中</span>
              </div>
              <div className="flex items-center justify-between">
                <span>版本</span>
                <span className="text-slate-500 text-xs">v0.2.0 · 联机版</span>
              </div>
              <div className="flex items-center justify-between">
                <span>玩家数</span>
                <span className="text-slate-500 text-xs">{players.length} 人</span>
              </div>
              <div className="flex items-center justify-between">
                <span>当前阶段</span>
                <span className="text-slate-500 text-xs">{PHASE_LABEL[currentPhase] || '游戏中'}</span>
              </div>
            </div>
            <Button onClick={onClose} className="w-full bg-slate-700 hover:bg-slate-600 text-xs h-8">关闭</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (popup.type === 'rules') {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <Card className="bg-slate-800 border-slate-700 w-full max-w-md max-h-[85vh]" onClick={e => e.stopPropagation()}>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-slate-400" />游戏规则 & 角色技能
              </h3>
              <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <Separator className="bg-slate-700" />
            <ScrollArea className="max-h-[55vh] pr-2">
              <div className="space-y-4">
                {/* 基本规则 */}
                <div>
                  <h4 className="text-sm font-bold text-indigo-400 mb-2">📖 基本规则</h4>
                  <div className="text-xs text-slate-300 space-y-1.5">
                    <p>• 游戏分为 <span className="text-red-400">杀手</span> 和 <span className="text-blue-400">平民</span> 两个阵营</p>
                    <p>• 杀手在行动阶段可以攻击同房间的玩家</p>
                    <p>• 结算阶段统一处理伤害，有功夫则反杀攻击者</p>
                    <p>• 玩家在移动阶段可移动到相邻地点</p>
                    <p>• 4轮探查/行动/移动后进入发言和投票阶段</p>
                    <p>• 投票淘汰票数最高的玩家</p>
                  </div>
                </div>

                {/* 地点效果 */}
                <div>
                  <h4 className="text-sm font-bold text-emerald-400 mb-2">🗺️ 地点效果</h4>
                  <div className="text-xs text-slate-300 space-y-1.5">
                    <p><span className="text-amber-400">⛑️ 阿萨姆疯人院</span> — 杀手在此攻击不消耗次数</p>
                    <p><span className="text-amber-400">🌳 中心公园</span> — 永远不会被封锁</p>
                    <p><span className="text-amber-400">🛍️ 商业街</span> — 平民无法看到周围的人</p>
                    <p><span className="text-amber-400">🏛️ 凌宇神社</span> — 可查看地点经过人员</p>
                    <p><span className="text-amber-400">🏥 疾控中心</span> — 平民死亡会变为杀手</p>
                    <p><span className="text-amber-400">🌉 志成桥</span> — 单向通行</p>
                    <p><span className="text-amber-400">🚔 一大队</span> — 禁止攻击</p>
                    <p><span className="text-amber-400">🌲 南翠屏公园</span> — 连锁死亡</p>
                  </div>
                </div>

                {/* 英雄技能 */}
                <div>
                  <h4 className="text-sm font-bold text-purple-400 mb-2">⚡ 英雄技能</h4>
                  <div className="space-y-2">
                    {HERO_POOL.map(hero => (
                      <div key={hero.id} className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-700">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                            style={{ backgroundColor: hero.color }}>
                            {hero.name.charAt(0)}
                          </div>
                          <span className="text-xs font-bold text-white">{hero.name}</span>
                          <span className="text-[10px] text-slate-500">{hero.title}</span>
                          <Badge variant="outline" className="text-[9px] h-4 ml-auto border-slate-600 text-slate-400">
                            速{hero.speed}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-slate-400 mb-1">{hero.description}</p>
                        {hero.skills.map(s => (
                          <div key={s.id} className="flex items-start gap-1.5 text-[10px] text-slate-300">
                            <span className="text-amber-400 shrink-0 mt-0.5">◆</span>
                            <div>
                              <span className="font-medium text-amber-300">{s.name}</span>
                              <span className="text-slate-500 ml-1">
                                ({s.targetType === 'self' ? '自身' : s.targetType === 'same_location_player' ? '同房间' : s.targetType === 'any_player' ? '任意' : s.targetType === 'adjacent_location' ? '相邻地点' : '特殊'}
                                · {s.limit === 'once_per_game' ? '全局1次' : s.limit === 'once_per_round' ? '每轮1次' : '无限'})
                              </span>
                              <p className="text-slate-400">{s.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
            <Button onClick={onClose} className="w-full bg-slate-700 hover:bg-slate-600 text-xs h-8">关闭</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="bg-slate-800 border-slate-700 w-full max-w-xs" onClick={e => e.stopPropagation()}>
        <CardContent className="p-5 text-center space-y-4">
          {popup.type === 'confirm' ? (
            <>
              <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
              <h3 className="text-base font-bold text-white whitespace-pre-line">{popup.title}</h3>
              <div className="flex gap-3 pt-1">
                <Button variant="outline" onClick={onClose}
                  className="flex-1 border-slate-600 text-slate-300 h-9 text-sm">取消</Button>
                <Button onClick={() => { popup.onConfirm?.(); onClose() }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-9 text-sm">{popup.confirmText || '确定'}</Button>
              </div>
            </>
          ) : (
            <>
              <Check className="w-10 h-10 text-emerald-400 mx-auto" />
              <h3 className="text-base font-bold text-white">{popup.title}</h3>
              {popup.desc && <p className="text-sm text-slate-400 whitespace-pre-line">{popup.desc}</p>}
              <Button onClick={onClose} className="bg-indigo-600 hover:bg-indigo-700 w-full h-9 text-sm">知道了</Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
