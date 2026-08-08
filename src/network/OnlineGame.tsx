import { useState, useEffect, useRef } from 'react'
import { useGameStore } from '@/store/gameStore'
import { getHeroById, HERO_POOL } from '@/data/heroData'
import { getReachableLocations, HERO_POOL_V1_1_IDS } from '@/data/gameData'
import { unregisterRoom, wsUnregisterRoom } from './roomServer'
import { netToHost, netOn, netSendGameAction } from './netClient'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { HeroSkill } from '@/types/hero'
import {
  Settings, BookOpen, Footprints, Zap, Swords,
  MapPin,
  Check, X, AlertCircle, ChevronUp, ChevronDown,
  Skull, Heart,
  Navigation
} from 'lucide-react'

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
  isSpectator?: boolean
  debugMode: boolean
  botNames?: string[]
  joinedPlayers?: Array<{ serverId: string; name: string }>
  onLeave: () => void
}

export function OnlineGame({ isHost, isSpectator, botNames, joinedPlayers, onLeave }: OnlineGameProps) {
  const store = useGameStore()
  const {
    phase, round, players, locations,
    movePlayer, nextPhase, killPlayer,
    activateKungFu, activateTeleport, activateDoubleMove, applyHalt, roundSkillUsage,
    usedSkills,
  } = store

  // ── 本地状态 ──
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [popup, setPopup] = useState<PopupState | null>(null)
  const [interaction, setInteraction] = useState<GameInteraction>('idle')
  const [selectedSkill, setSelectedSkill] = useState<HeroSkill | null>(null)
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [hasMoved, setHasMoved] = useState(false)
  const [readyPlayers, setReadyPlayers] = useState<Set<string>>(new Set())
  const [myReady, setMyReady] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [hasAttacked, setHasAttacked] = useState(false)
  const [cutPair, setCutPair] = useState<string[]>([])
  const voteCollector = useRef<Array<{ voterId: string; targetId: string }>>([])

  // 阶段变更时重置移动状态
  useEffect(() => { setHasMoved(false); setReadyPlayers(new Set()); setMyReady(false) }, [phase])
  // 攻击次数按轮刷新（投票结束后重置，阶段变化不重置）
  useEffect(() => { setHasAttacked(false) }, [round])

  // 当前玩家：房主=players[0]，玩家=myPlayerId对应slot
  const currentPlayer = isSpectator
    ? null
    : isHost
      ? (players && players.length > 0 ? players[0] : null)
      : (store.myPlayerId ? players.find(p => p.id === store.myPlayerId) || null : null)
  const hero = currentPlayer?.heroId ? getHeroById(currentPlayer.heroId) : null

  // ── 阶段信息 ──
  // 游戏结束时注销房间（不再显示在大厅）
  useEffect(() => {
    if (phase === 'end') {
      const roomId = (() => { try { return localStorage.getItem('rs_room_code') } catch { return null } })()
      if (roomId) {
        unregisterRoom(roomId)
        wsUnregisterRoom(roomId)
      }
    }
  }, [phase])

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

  // ── 初始化：等待服务器状态（服务器权威） ──
  useEffect(() => {
    const applyServerState = (msg: any) => {
      if ((msg.type === 'game_init' || msg.type === 'sync') && msg.state) {
        if (Array.isArray(msg.state.players) && msg.state.players.length > 0) {
          store.applyRemoteState(msg.state)
          setLoading(false)
          // 还没收到自己的身份 → 服务器在game_init时会私发
        }
      } else if (msg.type === 'your_role') {
        store.setMyInfo(msg.playerId, msg.identity)
        if (msg.heroId && msg.heroId !== '') {
          store.setPlayerHero(msg.playerId, msg.heroId)
        }
      } else if (msg.type === 'private_info') {
        setPopup({ type: 'info', title: '🔍 探查结果', desc: msg.text })
      }
    }

    netOn('hostMessage', applyServerState)
    // 主动请求状态（服务器每次操作后广播，但请求一次兜底）
    setTimeout(() => {
      netToHost({ type: 'request_state' })
    }, 300)
    // 兜底：8秒强制结束
    const t2 = setTimeout(() => setLoading(false), 8000)
    return () => clearTimeout(t2)
  }, [])

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
    // 疾行状态下允许第二次移动
    if (hasMoved && !currentPlayer.doubleMoveActive) { info('已移动过', '本回合你已经移动过了'); return }
    if (!hasMoved && reachableLocations.length === 0) { info('无处可去', '当前地点没有相连的道路'); return }
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

      // 传送：可到达任意地点
      const isTeleport = currentPlayer.teleportReady
      // 死人湾：允许前往 extraDestinations
      const bridgeDests = currentLoc.effect?.type === 'bridge_jump' ? (currentLoc.effect.extraDestinations || []) : []
      const canReachViaBridge = bridgeDests.includes(targetLoc.name)
      if (!isTeleport && !canReachViaBridge && !currentLoc.connectedTo.includes(locId)) {
        info('无法到达', `从 ${currentLoc.name} 无法到达 ${targetLoc.name}`)
        return
      }

      confirm(`移动到 ${targetLoc.name}？${isTeleport ? ' (传送)' : ''}`, () => {
        // 服务器权威：发送移动操作
        netSendGameAction('move', { playerId: currentPlayer.id, locationId: locId })
        setSelectedLocationId(locId)
        // 疾行：第一次移动后不锁，第二次才锁
        if (currentPlayer.doubleMoveActive && !currentPlayer.doubleMoveFirstDone) {
          resetInteraction()
          info('疾行·第一次移动', `已到达 ${targetLoc.name}，还可再移动一次`)
        } else {
          setHasMoved(true)
          resetInteraction()
          info('移动完成', `已到达 ${targetLoc.name}`)
        }
      })
      return
    }

    if (interaction === 'skill_target' && selectedSkill) {
      // 对玩家技能：点击地点时提示选择玩家
      if (selectedSkill.targetType === 'same_location_player' || selectedSkill.targetType === 'any_player') {
        info('请选择玩家', `【${selectedSkill.name}】只能对玩家使用，请点击地图上的玩家头像`)
        return
      }
      // 断路：选择两个地点
      if (selectedSkill.id === 'zhangyang_cut_connection') {
        if (cutPair.length === 0) {
          setCutPair([locId])
          info('选择第一个地点', '已选择，请再点击第二个地点')
        } else if (cutPair.length === 1) {
          const first = cutPair[0]
          const locA = locations.find(l => l.id === first)
          const locB = locations.find(l => l.id === locId)
          if (first === locId) { info('相同地点', '请选择两个不同的地点'); return }
          if (!locA?.connectedTo.includes(locId) && !locB?.connectedTo.includes(first)) {
            info('无道路相连', '这两个地点之间没有道路')
            setCutPair([])
            return
          }
          confirm(`切断 ${locA?.name} ↔ ${locB?.name} 的道路？`, () => {
            // 服务器权威：发送断路
            netSendGameAction('skill', { playerId: currentPlayer?.id, skillId: 'zhangyang_cut_connection', targetId: first, targetLocationId: locId })
            setCutPair([])
            resetInteraction()
            info('断路成功', `${locA?.name} ↔ ${locB?.name} 的道路已被切断`)
          })
        }
        return
      }
      // 如果是 location 类型的目标（如大力射门选相邻地点）
      if (selectedSkill.id === 'wangli_big_shot') {
        const curLoc = locations.find(l => l.id === currentPlayer?.locationId)
        const tgtLoc = locations.find(l => l.id === locId)
        if (!curLoc || !tgtLoc) return
        const isAdjacent = curLoc.connectedTo.includes(locId)
        if (!isAdjacent) { info('无法使用', '只能选择相邻地点'); return }
        confirm(`对 ${tgtLoc.name} 大力射门？`, () => {
          netSendGameAction('skill', { playerId: currentPlayer?.id, skillId: 'wangli_big_shot', targetLocationId: locId })
          resetInteraction()
        })
        return
      }
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

    // 检查阶段 - 灵活匹配
    const phaseMatch = skill.usablePhase.some(p => phase.startsWith(p) || (p === 'vote' && phase === 'vote') || p === phase)
    if (!phaseMatch) {
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
    // once_per_round 技能每轮限一次
    if (skill.limit === 'once_per_round') {
      const usedThisRound = (roundSkillUsage && roundSkillUsage[skill.id]) || 0
      if (usedThisRound >= skill.maxUses) {
        info('已使用', `【${skill.name}】每轮仅能使用${skill.maxUses}次`)
        return
      }
    }

    // 根据目标类型处理
    switch (skill.targetType) {
      case 'self':
        confirm(`使用【${skill.name}】？\n${skill.description}`, () => handleSkillUse(skill))
        break
      case 'location_pair':
        // 断路：直接进入选点模式
        setCutPair([])
        setInteraction('skill_target')
        setSelectedSkill(skill)
        setSkillsOpen(false)
        info('🚧 断路', '在地图上依次点击两个有道路相连的地点，切断它们之间的路')
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

    // 标记技能已使用
    if (skill.limit === 'once_per_game') {
      store.markSkillUsed(playerId, skill.id)
    }
    if (skill.limit === 'once_per_round') {
      store.incrementRoundSkillUsage(skill.id)
    }

    // 执行技能效果
    switch (skill.id) {
      // 普通攻击（杀手通用）
      case 'basic_kill':
        if (targetPlayerId) {
          // 服务器权威：攻击由服务器执行
          setHasAttacked(true)
          const target = players.find(p => p.id === targetPlayerId)
          info('🔪 攻击已发出', `对 ${target?.name || '目标'} 发起攻击，等待结算...`)
        }
        break
      // ═══════════════════════════════════════════
      // 杰克.死眼 —— 功夫
      // ═══════════════════════════════════════════
      case 'niangao_kungfu':
        activateKungFu(playerId)
        info('🥟 功夫已激活', '功夫反弹：若有玩家同地点攻击你，你会自动反杀对方！')
        break

      // ═══════════════════════════════════════════
      // 斯派洛 —— 影杀
      // ═══════════════════════════════════════════
      case 'xiling_kill_same_room':
        if (targetPlayerId) {
          store.killPlayer(targetPlayerId, playerId)
          const target = players.find(p => p.id === targetPlayerId)
          info('🗡️ 影杀成功', `${target?.name} 已死亡。身份：${target?.identity === 'killer' ? '🔴 杀手' : '🔵 平民'}`)
        }
        break

      // ═══════════════════════════════════════════
      // 科雄 —— 邪教头子：洞察
      // ═══════════════════════════════════════════
      case 'kexiong_investigate':
        if (targetPlayerId) {
          const target = players.find(p => p.id === targetPlayerId)
          const identity = target?.identity === 'killer' ? '🔴 杀手' : '🔵 平民'
          info('🔍 洞察 —— 查验结果', `目标：${target?.name}，身份：${identity}`)
        }
        break

      // ═══════════════════════════════════════════
      // 麟破仑.熔金 —— 识破
      // ═══════════════════════════════════════════
      case 'tianyi_investigate_same_room':
        if (targetPlayerId) {
          const target = players.find(p => p.id === targetPlayerId)
          const identity = target?.identity === 'killer' ? '🔴 杀手' : '🔵 平民'
          info('👁️ 识破 —— 查验结果', `目标：${target?.name}，身份：${identity}`)
        }
        break

      // ═══════════════════════════════════════════
      // 言浊（暂未开放）
      // ═══════════════════════════════════════════
      case 'yanzhuo_suplex':
        if (targetPlayerId) {
          applyHalt(targetPlayerId)
          const target = players.find(p => p.id === targetPlayerId)
          info('🤼 过肩摔成功', `${target?.name} 下个移动阶段无法行动（停步）`)
        }
        break

      // ═══════════════════════════════════════════
      // 玛丽 —— 追踪香囊
      // ═══════════════════════════════════════════
      case 'baiye_track':
        if (targetPlayerId) {
          store.setTrackedPlayer(targetPlayerId)
          store.addTrackRecord(playerId, '开始追踪', currentPlayer?.locationId)
          const target = players.find(p => p.id === targetPlayerId)
          info('🌿 追踪香囊已标记', `已标记 ${target?.name}，右侧面板将显示其行动记录`)
        }
        break

      // ═══════════════════════════════════════════
      // 银行经理 —— 潜伏
      // ═══════════════════════════════════════════
      case 'yeyu_stealth':
        applyHalt(playerId)
        info('🦎 潜伏状态', '下个移动阶段你无法行动，但行动阶段可正常使用技能')
        break

      // ═══════════════════════════════════════════
      // 罗宾 —— 疾行
      // ═══════════════════════════════════════════
      case 'zhuxun_double_move':
        activateDoubleMove(playerId)
        info('🏃 疾行已激活', '本移动阶段你可以连续移动两次')
        break

      // ═══════════════════════════════════════════
      // 冯明（暂未开放）
      // ═══════════════════════════════════════════
      case 'fengming_teleport':
        activateTeleport(playerId)
        info('✨ 传送已激活', '下次移动可到达任意地点（不限于相邻地点）')
        break

      // ═══════════════════════════════════════════
      // 麦克.锐耳 —— 断路
      // ═══════════════════════════════════════════
      case 'zhangyang_cut_connection':
        setCutPair([])
        setInteraction('skill_target')
        setSelectedSkill(skill)
        info('🚧 断路', '在地图上依次点击两个地点来切断道路')
        break

      // ═══════════════════════════════════════════
      // 王力（暂未开放）
      // ═══════════════════════════════════════════
      case 'wangli_big_shot':
        if (targetLocationId) {
          const targetLoc = locations.find(l => l.id === targetLocationId)
          const locPlayers = players.filter(p => p.locationId === targetLocationId && p.status === 'alive')
          locPlayers.forEach(p => applyHalt(p.id))
          info('⚽ 大力射门！', `${targetLoc?.name} 内玩家下回合无法行动：${locPlayers.map(p => p.name).join('、') || '无'}`)
        }
        break

      // ═══════════════════════════════════════════
      // 江枫（暂未开放）
      // ═══════════════════════════════════════════
      case 'jiangfeng_drone':
        if (currentPlayer?.locationId) {
          store.setDroneState(currentPlayer.id, currentPlayer.locationId, round)
          const loc = locations.find(l => l.id === currentPlayer.locationId)
          info('🛸 侦察无人机已部署', `在 ${loc?.name || '当前地点'} 部署了无人机，将记录经过人员`)
        }
        break

      default:
        info('⚡ 技能已使用', `【${skillName}】
${skill.description}`)
    }

    // 服务器权威：发送技能操作
    netSendGameAction('skill', {
      playerId: currentPlayer?.id,
      skillId: skill.id,
      targetId: targetPlayerId,
      targetLocationId: targetLocationId,
    })

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

  // ── 准备 / 就绪系统 ──
  const handleReady = () => {
    if (isGameOver) {
      confirm('返回大厅？', () => onLeave())
      return
    }
    // 服务器权威：发送准备
    if (currentPlayer) {
      netSendGameAction('ready', { playerId: currentPlayer.id })
      setMyReady(true)
      info('已准备', '等待其他玩家准备...')
    }
  }

  // ── 加载中 ──
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900 p-4">
        <div className="text-center space-y-4">
          <div className="text-5xl mb-3 animate-pulse">🎮</div>
          <h2 className="text-lg font-bold text-white">准备中</h2>
          <div className="w-48 h-1.5 bg-slate-700 rounded-full overflow-hidden mx-auto">
            <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
          <p className="text-xs text-slate-500">游戏即将开始...</p>
          <p className="text-[9px] text-slate-600">第一次进入的玩家需要等待一会，完成本地初始化，请谅解</p>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════
  //  主界面渲染
  // ═══════════════════════════════════════════════════

  // 判断当前可用的英雄技能
  const availableSkills = currentPlayer && hero ? hero.skills.filter(s => {
    // 检查阶段
    const phaseOk = s.usablePhase.some(p => phase.startsWith(p) || (p === 'vote' && phase === 'vote') || p === phase)
    // 检查次数
    const usedSkillIds = usedSkills[currentPlayer?.id || ''] || []
    const roundUsed = s.limit === 'once_per_round' && roundSkillUsage[s.id] && roundSkillUsage[s.id] >= 1
    const notUsed = s.limit === 'unlimited' || (!roundUsed && (s.limit === 'once_per_round' || !usedSkillIds.includes(s.id)))
    return phaseOk && notUsed
  }) : []

  // 判断是否为选目标模式
  const isTargetingMode = interaction === 'skill_target' && selectedSkill
  const isMoveMode = interaction === 'moving'

  // 渲染错误兜底
  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900 p-4">
        <div className="text-center space-y-3 max-w-sm">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-lg font-bold text-white">游戏渲染出错</h2>
          <p className="text-xs text-red-400 font-mono bg-slate-800 p-3 rounded text-left whitespace-pre-wrap">{error}</p>
          <button onClick={() => { setError(null); window.location.reload() }}
            className="px-4 py-2 bg-indigo-600 rounded-lg text-white text-sm">重试</button>
        </div>
      </div>
    )
  }

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

        {/* 玩家信息 */}
        {currentPlayer && hero && (
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="hidden sm:block text-[10px] leading-tight text-right">
              <p className="text-white font-medium">{hero.name} · {hero.title}</p>
              <p className="text-slate-400">{currentPlayer.identity === 'killer' ? '🔴 杀手' : '🔵 平民'}</p>
            </div>
            <div className="sm:hidden text-[10px] text-white font-medium">{hero.name}</div>
          </div>
        )}

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
      {/* 通知条 */}
      {toast && (
        <div className="shrink-0 bg-amber-900/80 border-b border-amber-700 px-3 py-1.5 text-[11px] text-amber-200 flex items-center justify-between">
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="text-amber-400 hover:text-amber-200 ml-2">✕</button>
        </div>
      )}
      <div className="shrink-0 bg-amber-900/80 border-b border-amber-700 px-3 py-1.5 text-[11px] text-amber-200">
        💡 地点效果提示：曼城禁武、西部荒野变异、曼斯顿边境连锁死亡等
      </div>

      {/* ═══ 主内容区域 ═══ */}
      <main className="flex-[2] flex flex-col min-h-0">
        {/* ── 投票阶段专用界面 ── */}
        {phase === 'vote' ? (
          <VoteSection
            isHost={isHost}
            voteCollector={voteCollector}
            currentPlayer={currentPlayer} hero={hero}
            alivePlayers={alivePlayers}
            usedSkills={usedSkills}
            store={store}
            onNextPhase={handleReady}
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
        ) : phase === 'end' ? (
          <EndGameSection players={players} alivePlayers={alivePlayers} />
        ) : (
          <>
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
                const isSelected = selectedLocationId === loc.id && !isCurrentLoc
                // 传送激活时所有地点可达
                const isTeleportReady = isMoveMode && currentPlayer?.teleportReady
                const isReachable = isMoveMode && (isTeleportReady ? true : reachableLocations.some(r => r.id === loc.id))
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
                    {/* 选中高亮 */}
                    {isSelected && (
                      <circle cx={loc.x} cy={loc.y} r={6}
                        fill="none" stroke="#f59e0b" strokeWidth="1" opacity="0.5" />
                    )}
                    {/* 断路选点高亮 */}
                    {cutPair.length === 1 && cutPair[0] === loc.id && (
                      <circle cx={loc.x} cy={loc.y} r={5.5}
                        fill="none" stroke="#dc2626" strokeWidth="1.5" opacity="0.8">
                        <animate attributeName="r" values="5.5;6.5;5.5" dur="1s" repeatCount="indefinite" />
                      </circle>
                    )}
                    {/* 断路模式：显示可切断的道路 */}
                    {selectedSkill?.id === 'zhangyang_cut_connection' && currentPlayer && (
                      (() => {
                        const cl = locations.find(l => l.id === currentPlayer!.locationId)
                        return cl?.connectedTo.map(connId => {
                          const ct = locations.find(l => l.id === connId)
                          if (!ct) return null
                          const mx = (cl.x + ct.x) / 2, my = (cl.y + ct.y) / 2
                          return <text key={'cutable_'+connId} x={mx} y={my} textAnchor="middle" fontSize="2.5" fill="#f59e0b" fontWeight="bold">可切断</text>
                        })
                      })()
                    )}
                    {/* 被切断的道路（红×） */}
                    {store.cutConnections && store.cutConnections.map((cut: any, ci: number) => {
                      const cA = locations.find((l: any) => l.id === cut.locA)
                      const cB = locations.find((l: any) => l.id === cut.locB)
                      if (!cA || !cB) return null
                      const mx = (cA.x + cB.x) / 2, my = (cA.y + cB.y) / 2
                      return (
                        <g key={`cut_${ci}`}>
                          <line x1={mx-1.5} y1={my-1.5} x2={mx+1.5} y2={my+1.5} stroke="#dc2626" strokeWidth="1" />
                          <line x1={mx+1.5} y1={my-1.5} x2={mx-1.5} y2={my+1.5} stroke="#dc2626" strokeWidth="1" />
                        </g>
                      )
                    })}
                    {/* 地点圆圈 */}
                    <circle cx={loc.x} cy={loc.y} r={4.5}
                      fill={isCurrentLoc ? '#4f46e5' : isSelected ? '#92400e' : '#475569'}
                      stroke={isCurrentLoc ? '#818cf8' : isSelected ? '#f59e0b' : isReachable ? '#818cf8' : isTargetingMode ? '#f59e0b' : '#475569'}
                      strokeWidth={isCurrentLoc || isSelected || isReachable || isTargetingMode ? '1.5' : '0.8'}
                    />
                    {/* 地点名称（全称） */}
                    <text x={loc.x} y={loc.y + 9} textAnchor="middle"
                      fontSize="2.8" fill={isCurrentLoc ? '#c7d2fe' : '#94a3b8'}
                      fontWeight={isCurrentLoc ? '700' : '500'}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {loc.name}
                    </text>
                    {/* 地点效果标记 */}
                    {loc.effect && loc.effect.type !== 'placeholder' && (
                      <text x={loc.x} y={loc.y + 12.5} textAnchor="middle"
                        fontSize="2.2" fill="#d97706" fontWeight="600"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {loc.effect.name}
                      </text>
                    )}
                    {/* 玩家图标 - 仅当前地点显示（观战者看全图） */}
                    {(isCurrentLoc || isSpectator) && locPlayers.map((p, i) => {
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
                  {currentPlayer?.teleportReady ? '✨ 传送模式：点击任意地点' : '选择高亮地点进行移动'}
                </text>
              )}
              {isTargetingMode && selectedSkill && (
                <text x={50} y={5} textAnchor="middle" fontSize="3.5" fill="#f59e0b" fontWeight="600"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {selectedSkill.id === 'zhangyang_cut_connection'
                    ? (cutPair.length === 0 ? '点击第一个地点（断路）' : '点击第二个地点（断路）')
                    : selectedSkill.targetType === 'adjacent_location'
                      ? '点击一个相邻地点 — ' + selectedSkill.name
                      : selectedSkill.targetType === 'same_location_player'
                        ? '点击同房间的玩家 — ' + selectedSkill.name
                        : selectedSkill.targetType === 'any_player'
                          ? '点击任意玩家 — ' + selectedSkill.name
                          : `选择目标 — ${selectedSkill.name}`}
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

        {/* ═══ 底部双栏面板 ═══ */}
        <div className="shrink-0 bg-slate-800/60 border-t border-slate-700">
          <div className="flex gap-0">
            {/* 左栏：状态+地点信息+同地点玩家+尸体 */}
            <div className="flex-1 px-3 py-1.5 min-w-0 border-r border-slate-700/50">
              {/* 凌宇神社神视按钮 */}
              {currentPlayer && infoLocation?.effect?.type === 'shrine_vision' && infoLocation.id === currentPlayer.locationId && (
                <button onClick={() => {
                  const visits = store.locationVisits?.[infoLocation.id] || []
                  const visitNames = visits.map((id: string) => players.find((p: any) => p.id === id)).filter(Boolean).map((p: any) => p.name)
                  const currentHere = players.filter((p: any) => p.locationId === infoLocation.id && p.status === 'alive').map((p: any) => p.name)
                  info('🏛️ 双阳 · 神视',
                    '现在此地：' + (currentHere.join('、') || '无') +
                    (visitNames.length > 0 ? '\n\n本轮经过：' + visitNames.join('、') : '\n\n本轮经过：无')
                  )
                }}
                  className="w-full text-left text-[9px] px-2 py-1 rounded mb-1.5 bg-purple-900/40 text-purple-400 border border-purple-800/50 hover:bg-purple-800/50 transition-colors">
                  🏛️ 神视 - 查看经过记录
                </button>
              )}
              {/* 状态效果显示 */}
              {currentPlayer && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {currentPlayer.halted && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-800/50">
                      🚫 停步
                    </span>
                  )}
                  {store.kungFuActivePlayers?.includes(currentPlayer.id) && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400 border border-amber-800/50">
                      🥟 功夫
                    </span>
                  )}
                  {currentPlayer.teleportReady && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-900/40 text-purple-400 border border-purple-800/50">
                      ✨ 传送
                    </span>
                  )}
                  {currentPlayer.doubleMoveActive && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-900/40 text-cyan-400 border border-cyan-800/50">
                      🏃 疾行
                    </span>
                  )}
                </div>
              )}
              {infoLocation ? (
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-900/50 border border-indigo-700/50 flex items-center justify-center shrink-0">
                    <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-white">{infoLocation.name}</span>
                      {infoLocation.id === currentPlayer?.locationId && (
                        <Badge className="text-[8px] h-3.5 bg-indigo-600/80 text-indigo-200 border-0">你在这里</Badge>
                      )}
                      {infoLocation.isBlocked && (
                        <Badge className="text-[8px] h-3.5 bg-red-600/80 text-red-200 border-0">封锁中</Badge>
                      )}
                      {selectedLocationId && selectedLocationId !== currentPlayer?.locationId && (
                        <button onClick={() => setSelectedLocationId(null)}
                          className="text-[9px] text-slate-500 hover:text-white">返回</button>
                      )}
                    </div>
                    {infoLocation.effect && infoLocation.effect.type !== 'placeholder' && (
                      <p className="text-[10px] text-amber-400/80 mt-0.5">
                        {infoLocation.effect.name}
                        <span className="text-slate-500 ml-1">
                          — {{
                            asylum_extra_attack: '杀手在此可额外攻击一次',
                            unblockable: '不会被封锁',
                            crowded: '平民无视野',
                            shrine_vision: '可查看经过记录',
                            identity_transform: '平民死亡会变异为杀手',
                            no_attack: '禁止攻击',
                            bridge_jump: '单向通行到甘露之地/死人沼泽',
                            mass_civilian_death: '连锁死亡',
                            placeholder: ''
                          }[infoLocation.effect.type] || ''}
                        </span>
                      </p>
                    )}
                    {/* 同地点存活玩家 */}
                    {infoLocation.id === currentPlayer?.locationId && infoPlayers.filter(p => p.id !== currentPlayer?.id).length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {infoLocation.effect?.type === 'crowded' && currentPlayer?.identity === 'civilian' ? (
                          <span className="text-[9px] text-slate-500">🛍️ 甘露之地人头攒动，看不清周围</span>
                        ) : (
                          <>
                        <span className="text-[9px] text-emerald-400">●</span>
                        {infoPlayers.filter(p => p.id !== currentPlayer?.id).map(p => {
                          const pHero = p.heroId ? getHeroById(p.heroId) : null
                          return (
                            <span key={p.id} className="text-[10px] text-slate-300"
                              style={pHero ? {color: pHero.color} : {}}>
                              {players.indexOf(p) + 1}.{p.name}
                            </span>
                          )
                        })}
                          </>
                        )}
                      </div>
                    )}
                    {/* 同地点尸体 */}
                    {infoLocation.id === currentPlayer?.locationId && deadPlayers.filter(p => p.locationId === infoLocation.id).length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {infoLocation.effect?.type === 'crowded' && currentPlayer?.identity === 'civilian' ? (
                          <span className="text-[9px] text-slate-500">🛍️ 甘露之地人头攒动，看不清尸体</span>
                        ) : (
                          <>
                        <span className="text-[9px] text-red-400">✕</span>
                        {deadPlayers.filter(p => p.locationId === infoLocation.id).map(p => (
                          <span key={p.id} className="text-[10px] text-red-400/70">{p.name}</span>
                        ))}
                          </>
                        )}
                      </div>
                    )}

                    {infoLocation.id !== currentPlayer?.locationId && (
                      <p className="text-[10px] text-slate-500 mt-0.5">🔒 未知</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">加载中...</p>
              )}
            </div>
            {/* 右栏：技能追踪/记录区 */}
            <div className="w-1/3 min-w-[100px] px-3 py-2">
              <InfoPanel store={store} players={players} />
            </div>
          </div>
        </div>
      </>
      )}
      </main>

      {/* ═══ 底部操作栏 ═══ */}
      {/* 观战提示 + 事件日志 */}
      {isSpectator && (
        <div className="shrink-0 border-t border-slate-700 bg-slate-800/70 px-3 py-2">
          <p className="text-[10px] text-purple-400 font-medium mb-1">👁️ 观战模式 - 全图视角</p>
          <div className="max-h-[80px] overflow-auto space-y-0.5">
            {store.events.slice(-10).map((e: any, i: number) => (
              <p key={i} className="text-[9px] text-slate-500">{e.description}</p>
            ))}
          </div>
        </div>
      )}
      <footer className="shrink-0 border-t border-slate-700 bg-slate-800/90">
        <div className="flex items-center gap-2 px-3 py-2">
          {/* 左：身份查看按钮 */}
          {currentPlayer && !isGameOver && !isSpectator && (
            <button onClick={() => info('你的身份', currentPlayer.identity === 'killer' ? '🔴 杀手' : '🔵 平民')}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-slate-700/60 text-slate-300 hover:bg-slate-600 border border-slate-600 transition-colors shrink-0">
              👤 身份
            </button>
          )}
          {/* 左：技能区 */}
          <div className="flex-1 min-w-0">
            {!isSpectator && availableSkills.length > 0 && !isMoveMode && !isTargetingMode && (
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

          {/* 中：攻击按钮（杀手专用） */}
          {!isSpectator && currentPlayer?.identity === 'killer' && phase.startsWith('action') && !isMoveMode && !isTargetingMode && !isGameOver && (
            <button onClick={() => {
              if (hasAttacked || (currentPlayer && (currentPlayer.normalAttackRemaining || 0) <= 0)) {
                info('已攻击过', '本回合你已经刀过人了，投票结束后刷新')
                return
              }
              if (sameLocationPlayers.length === 0) { info('无目标', '附近没有其他玩家'); return }
              setSelectedSkill({ id: 'basic_kill', name: '攻击', description: '', type: 'active', targetType: 'same_location_player', limit: 'unlimited', usedCount: 0, maxUses: 99, usablePhase: [] } as any)
              setInteraction('skill_target')
            }}
              disabled={hasAttacked || (currentPlayer && (currentPlayer.normalAttackRemaining || 0) <= 0)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                hasAttacked || (currentPlayer && (currentPlayer.normalAttackRemaining || 0) <= 0)
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-red-700 hover:bg-red-600 text-white'
              }`}>
              <Swords className="w-3.5 h-3.5" />
              {hasAttacked || (currentPlayer && (currentPlayer.normalAttackRemaining || 0) <= 0) ? '已刀人' : '刀人'}
            </button>
          )}

          {/* 中：移动按钮 */}
          {!isSpectator && isMovePhase && !isMoveMode && !isTargetingMode && !isGameOver && (
            <button onClick={handleMoveClick}
              disabled={hasMoved && !currentPlayer?.doubleMoveActive}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                hasMoved && !currentPlayer?.doubleMoveActive
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : hasMoved && currentPlayer?.doubleMoveActive
                    ? 'bg-cyan-700 hover:bg-cyan-600 text-white'
                    : 'bg-emerald-700 hover:bg-emerald-600 text-white'
              }`}>
              <Footprints className="w-3.5 h-3.5" />
              {hasMoved && !currentPlayer?.doubleMoveActive ? '已移动'
                : hasMoved && currentPlayer?.doubleMoveActive ? '移动(2/2)'
                : currentPlayer?.doubleMoveActive ? '移动(1/2)'
                : '移动'}
            </button>
          )}

          {/* 右：准备/就绪按钮 */}
          {!isSpectator && !isGameOver && !phase.startsWith('vote') && phase !== 'vote_result' && phase !== 'death_report' && (
            <button onClick={handleReady}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                myReady ? 'bg-emerald-700 text-emerald-200' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}>
              {myReady ? <span>✅ 已就绪 {readyPlayers.size}/{alivePlayers.length}</span> : <><Check className="w-3.5 h-3.5" />准备</>}
            </button>
          )}

          {/* 游戏结束 */}
          {isGameOver && (
            <button onClick={handleReady}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 bg-slate-600 hover:bg-slate-500 text-white">
              返回大厅
            </button>
          )}
        </div>
      </footer>

      {/* ═══ 弹窗 ═══ */}
      {popup && <PopupOverlay popup={popup} onClose={() => setPopup(null)}
        players={players} currentPhase={phase} currentPlayerName={currentPlayer?.name || '玩家'}
        onExit={onLeave}
        onRename={(name: string) => {
          if (!currentPlayer) return
          if (isHost) {
            store.updatePlayerName(currentPlayer.id, name)
      
          } else {
            netToHost({ type: 'action', action: 'rename', data: { playerId: currentPlayer.id, name } })
            store.updatePlayerName(currentPlayer.id, name)
          }
        }} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════
//  信息面板（右栏：追踪/无人机/记录本）
// ═══════════════════════════════════════════════════
function InfoPanel({ store, players }: { store: any; players: any[] }) {
  const [showTrack, setShowTrack] = useState(false)
  const { trackRecords, trackedPlayerId, droneLocationId, locations } = store
  const trackedPlayer = players.find((p: any) => p.id === trackedPlayerId)
  const droneLoc = locations?.find((l: any) => l.id === droneLocationId)

  return (
    <div className="space-y-1 max-h-[100px] overflow-auto">
      {/* 追踪信息 */}
      {trackedPlayer && trackRecords && trackRecords.length > 0 && (
        <div>
          <p className="text-[9px] text-amber-400 font-medium mb-0.5">📡 追踪: {trackedPlayer.name}</p>
          <p className="text-[8px] text-slate-400">{trackRecords.length} 条记录</p>
          <button onClick={() => setShowTrack(true)}
            className="text-[8px] text-amber-500 hover:text-amber-400 underline mt-0.5">
            查看详细追踪报告 &gt;
          </button>
        </div>
      )}
      {/* 追踪报告弹窗 */}
      {showTrack && trackedPlayer && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowTrack(false)}>
          <div className="bg-slate-800 border border-amber-700/50 rounded-xl p-4 w-full max-w-sm max-h-[60vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-amber-400">📡 追踪报告 — {trackedPlayer.name}</h3>
              <button onClick={() => setShowTrack(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-1.5">
              {trackRecords.map((r: any, i: number) => {
                const loc = locations?.find((l: any) => l.id === r.locationId)
                return (
                  <div key={i} className="flex items-start gap-2 text-[10px] bg-slate-900/50 rounded p-1.5">
                    <span className="text-slate-500 shrink-0 font-mono">#{i + 1}</span>
                    <div>
                      <p className="text-slate-300">{r.action}</p>
                      {loc && <p className="text-slate-500">📍 {loc.name}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
      {/* 无人机信息 */}
      {droneLoc && (
        <p className="text-[9px] text-cyan-400">🛸 无人机: {droneLoc.name}</p>
      )}
      {/* 无可追踪信息时显示记录本按钮 */}
      {(!trackedPlayer || !trackRecords || trackRecords.length === 0) && !droneLoc && (
        <div>
          <p className="text-[9px] text-slate-500 font-medium mb-0.5">📋 记录</p>
          <button onClick={() => {
            const saved = localStorage.getItem('rongshousha_notes') || ''
            const note = prompt('记录你的推理：', saved)
            if (note !== null) localStorage.setItem('rongshousha_notes', note)
          }}
            className="w-full text-left text-[9px] text-slate-400 bg-slate-900/50 border border-slate-700 rounded p-2 hover:bg-slate-800 transition-colors">
            {localStorage.getItem('rongshousha_notes') 
              ? localStorage.getItem('rongshousha_notes')?.substring(0, 50) + (localStorage.getItem('rongshousha_notes')!.length > 50 ? '...' : '')
              : '点击记录推理...'}
          </button>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════
//  游戏结束组件
// ═══════════════════════════════════════════════════
function EndGameSection({ players, alivePlayers }: { players: any[]; alivePlayers: any[] }) {
  const store = useGameStore()
  const winner = store.winner
  if (!winner) return null
  
  const winnerSide = winner === 'good' ? '好人阵营' : '杀手阵营'
  const winnerIcon = winner === 'good' ? '👑' : '🗡️'
  
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 bg-gradient-to-b from-slate-900 via-indigo-950/30 to-slate-900">
      <div className="text-7xl mb-2 animate-pulse">{winnerIcon}</div>
      <h2 className="text-2xl font-bold text-white">{winnerSide} 胜利！</h2>
      <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-6 py-3 text-center max-w-xs">
        <p className="text-sm text-slate-300">
          {winner === 'good' ? '🔴 所有杀手已被消灭' : '🔵 平民已被全部消灭'}
        </p>
        <p className="text-xs text-slate-500 mt-1">存活 {alivePlayers.length} / {players.length}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 text-xs">
        {players.filter((p: any) => p.status === 'alive').map((p: any) => (
          <span key={p.id} className="text-slate-300 bg-slate-800/60 px-3 py-1 rounded-full border border-slate-700">
            {p.name} {p.identity === 'killer' ? '🔴' : '🔵'}
          </span>
        ))}
      </div>
      <div className="text-[10px] text-slate-600">游戏结束</div>
      <button onClick={() => window.location.reload()}
        className="mt-2 px-8 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-sm font-bold text-white transition-all shadow-lg shadow-indigo-900/30">
        返回大厅
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════
//  投票阶段组件
// ═══════════════════════════════════════════════════
function VoteSection({ isHost, currentPlayer, hero, alivePlayers, usedSkills, store, onNextPhase, voteCollector }: {
  isHost: boolean;
  voteCollector?: any;
  currentPlayer: any; hero: any;
  alivePlayers: any[]; usedSkills: Record<string, string[]>;
  store: any; onNextPhase: () => void;
}) {
  const [voteTarget, setVoteTarget] = useState<string | null>(null)
  const [gunshotTarget, setGunshotTarget] = useState<string | null>(null)
  const [voteSubmitted, setVoteSubmitted] = useState(false)

  const isLiLongxiang = hero?.id === 'lilongxiang'
  const gunShotUsed = isLiLongxiang && (usedSkills[currentPlayer?.id || ''] || []).includes('lilongxiang_gunshot')

  const handleConfirmVote = () => {
    // 服务器权威：发送投票 + 准备
    if (voteTarget) {
      netSendGameAction('vote', { playerId: currentPlayer?.id, targetId: voteTarget })
    }
    netSendGameAction('ready', { playerId: currentPlayer?.id })
    setVoteSubmitted(true)
  }

  return (
    <div className="flex-1 flex flex-col p-3 gap-3 overflow-auto">
      <p className="text-xs text-slate-400 text-center">点击选择你要投票淘汰的玩家</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {alivePlayers.map((p: any, idx: number) => {
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
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 bg-slate-600">
                  {idx + 1}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{isMe ? '你' : p.name}</p>
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

      {/* 枪毙技能（科利.清道夫） */}
      {isLiLongxiang && !gunShotUsed && (
        <div className="bg-slate-800/60 border border-red-800/50 rounded-xl p-3">
          <p className="text-xs font-bold text-red-400 mb-2">🔫 枪毙 — 选择处决目标</p>
          <div className="flex flex-wrap gap-1.5">
            {alivePlayers.filter((p: any) => p.id !== currentPlayer?.id).map((p: any) => {
              const isTarget = gunshotTarget === p.id
              return (
                <button key={p.id} onClick={() => setGunshotTarget(isTarget ? null : p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                    isTarget
                      ? 'bg-red-700 border-red-500 text-white'
                      : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-red-500'
                  }`}>
                  {p.name}
                </button>
              )
            })}
          </div>
          {gunshotTarget && (
            <button onClick={() => {
              // 服务器权威：发送枪毙
              netSendGameAction('skill', { playerId: currentPlayer?.id, skillId: 'lilongxiang_gunshot', targetId: gunshotTarget })
              setGunshotTarget(null)
            }}
              className="mt-2 w-full py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-bold text-white transition-colors">
              🔫 执行枪决
            </button>
          )}
        </div>
      )}

      {/* 确认投票 */}
      <div className="flex gap-2 mt-auto pt-2">
        <button onClick={handleConfirmVote} disabled={voteSubmitted}
          className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed">
          {voteSubmitted ? '✅ 已投票，等待其他玩家' : (voteTarget ? `确认投票（${alivePlayers.find((p: any) => p.id === voteTarget)?.name}）` : '确认投票')}
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
  const votedOut = newlyDead.slice(-3)
  const store2 = useGameStore()
  const winner = store2.winner


  // 胜利界面
  if (winner) {
    // 统计存活玩家信息
    const aliveKillers = players.filter((p: any) => p.status === 'alive' && p.identity === 'killer')
    const aliveCivs = players.filter((p: any) => p.status === 'alive' && p.identity === 'civilian')
    const winnerPlayers = winner === 'good' ? aliveCivs : aliveKillers
    const winnerSide = winner === 'good' ? '好人阵营' : '杀手阵营'
    const winnerIcon = winner === 'good' ? '👑' : '🗡️'
    
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 bg-gradient-to-b from-slate-900 via-indigo-950/30 to-slate-900">
        <div className="text-7xl mb-2 animate-pulse">{winnerIcon}</div>
        <h2 className="text-2xl font-bold text-white">{winnerSide} 胜利！</h2>
        <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-6 py-3 text-center max-w-xs">
          <p className="text-sm text-slate-300">
            {winner === 'good' ? '🔴 所有杀手已被绳之以法' : '🔵 平民已被全部消灭'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            存活 {alivePlayers.length} / {players.length}
          </p>
        </div>
        <div className="text-xs text-slate-400 text-center max-w-xs">
          {winnerPlayers.map((p: any) => (
            <span key={p.id} className="inline-block mx-1">{p.name}</span>
          ))}
        </div>
        <div className="text-[10px] text-slate-600">游戏结束</div>
        <button onClick={onNextPhase}
          className="mt-2 px-8 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-sm font-bold text-white transition-all shadow-lg shadow-indigo-900/30">
          返回大厅
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4 overflow-auto">
      <div className="text-4xl">📊</div>
      <h2 className="text-lg font-bold text-white">投票结果公示</h2>

      {/* 被投出玩家 */}
      {votedOut.length > 0 ? (
        <div className="space-y-2 w-full max-w-xs">
          {votedOut.map((p: any) => (
            <div key={p.id} className="bg-red-900/30 border border-red-700/50 rounded-xl p-3 text-center">
              <p className="text-base font-bold text-white">{p.name} 被投票出局</p>
              <p className="text-xs">{p.identity === 'killer' ? '🔴 杀手' : '🔵 平民'}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">无人被投票出局</p>
      )}

      {/* 投票详情：每个玩家投了谁 */}
      <div className="w-full max-w-xs bg-slate-800/50 rounded-xl p-3 border border-slate-700">
        <p className="text-xs font-bold text-slate-300 mb-2">📋 投票详情</p>
        <div className="space-y-1.5">
          {players.map((p: any) => {
            const target = p.votedFor ? players.find((x: any) => x.id === p.votedFor) : null
            return (
              <div key={p.id} className="flex items-center justify-between text-[10px] text-slate-400">
                <span className="text-white">{p.name}</span>
                <span>{target ? `→ ${target.name}` : '弃票'}</span>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-xs text-slate-500">存活 {alivePlayers.length} / {players.length}</p>
      <button onClick={onNextPhase}
        className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-bold text-white transition-colors">
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
//  英雄池滚动列表
// ═══════════════════════════════════════════════════
function HeroPagination() {
  return (
    <ScrollArea className="max-h-[50vh] pr-2">
      <div className="space-y-2">
        {HERO_POOL.filter((hero: any) => HERO_POOL_V1_1_IDS.includes(hero.id)).map(hero => (
          <div key={hero.id} className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-700">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                style={{ backgroundColor: hero.color }}>
                {hero.name.charAt(0)}
              </div>
              <span className="text-xs font-bold text-white">{hero.name}</span>
              <span className="text-[10px] text-slate-500">{hero.title}</span>
              <Badge variant="outline" className="text-[9px] h-4 ml-auto border-slate-600 text-slate-400">速{hero.speed}</Badge>
            </div>
            <p className="text-[10px] text-slate-400 mb-1">{hero.description}</p>
            {hero.skills.map(s => (
              <div key={s.id} className="flex items-start gap-1.5 text-[10px] text-slate-300">
                <span className="text-amber-400 shrink-0 mt-0.5">◆</span>
                <div>
                  <span className="font-medium text-amber-300">{s.name}</span>
                  <span className="text-slate-500 ml-1">
                    ({s.targetType === 'self' ? '自身' : s.targetType === 'same_location_player' ? '同房间' : s.targetType === 'any_player' ? '任意' : '特殊'}
                    · {s.limit === 'once_per_game' ? '全局1次' : s.limit === 'once_per_round' ? '每轮1次' : '无限'})
                  </span>
                  <p className="text-slate-400">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

// ═══════════════════════════════════════════════════
//  规则手册弹窗（双标签页）
// ═══════════════════════════════════════════════════
function RulesPopup({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'rules' | 'heroes'>('rules')
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="bg-slate-800 border-slate-700 w-full max-w-md max-h-[85vh]" onClick={e => e.stopPropagation()}>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-slate-400" />游戏手册
            </h3>
            <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-1 bg-slate-900 rounded-lg p-1">
            <button onClick={() => setTab('rules')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === 'rules' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}>📖 规则介绍</button>
            <button onClick={() => setTab('heroes')}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tab === 'heroes' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}>⚡ 全英雄池</button>
          </div>
          <Separator className="bg-slate-700" />
          <ScrollArea className="max-h-[55vh] pr-2">
            {tab === 'rules' ? (
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-indigo-400 mb-2">📖 基本规则</h4>
                  <div className="text-xs text-slate-300 space-y-1.5">
                    <p>• 游戏分为 <span className="text-red-400">杀手</span> 和 <span className="text-blue-400">平民</span> 两个阵营</p>
                    <p>• 杀手在行动阶段可以攻击同房间的玩家</p>
                    <p>• 有功夫的玩家受攻击时会反杀攻击者</p>
                    <p>• 玩家在移动阶段可移动到相邻地点</p>
                    <p>• 4轮行动/移动后进入投票阶段</p>
                    <p>• 投票淘汰票数最高的玩家，展示身份</p>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-emerald-400 mb-2">🗺️ 地点效果</h4>
                  <div className="text-xs text-slate-300 space-y-1.5">
                    <p><span className="text-amber-400">⛑️ 死人沼泽</span> — 杀手多一次攻击</p>
                    <p><span className="text-amber-400">🌳 死寂荒漠</span> — 永不封锁</p>
                    <p><span className="text-amber-400">🛍️ 甘露之地</span> — 平民无视野</p>
                    <p><span className="text-amber-400">🏛️ 双阳</span> — 查看经过人员</p>
                    <p><span className="text-amber-400">🏥 西部荒野</span> — 平民死亡变杀手</p>
                    <p><span className="text-amber-400">🌉 死人湾</span> — 单向通行</p>
                    <p><span className="text-amber-400">🚔 曼城</span> — 禁止攻击</p>
                    <p><span className="text-amber-400">🌲 曼斯顿边境</span> — 连锁死亡</p>
                  </div>
                </div>
              </div>
            ) : (
              <HeroPagination />
            )}
          </ScrollArea>
          <Button onClick={onClose} className="w-full bg-slate-700 hover:bg-slate-600 text-xs h-8">关闭</Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ═══════════════════════════════════════════════════
//  弹窗覆盖层
// ═══════════════════════════════════════════════════
function PopupOverlay({
  popup, onClose, players, currentPhase, currentPlayerName, onRename, onExit
}: {
  popup: PopupState
  onClose: () => void
  players: any[]
  currentPhase: string
  currentPlayerName?: string
  onRename?: (name: string) => void
  onExit?: () => void
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
                <span>玩家名</span>
                <button onClick={() => {
                  const nn = prompt('修改玩家名（8字以内）：', currentPlayerName || '玩家')
                  if (nn && nn.trim()) {
                    onRename?.(nn.trim().slice(0, 8))
                  }
                }}
                  className="text-slate-400 hover:text-white text-xs underline">{currentPlayerName || '玩家'}</button>
              </div>
              <div className="flex items-center justify-between">
                <span>玩家数</span>
                <span className="text-slate-500 text-xs">{players.length} 人</span>
              </div>
              <div className="flex items-center justify-between">
                <span>当前阶段</span>
                <span className="text-slate-500 text-xs">{PHASE_LABEL[currentPhase] || '游戏中'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>版本</span>
                <span className="text-slate-500 text-xs">MVP 0.0.1v</span>
              </div>
              <div className="flex items-center justify-between">
                <span>音效</span>
                <span className="text-slate-500 text-xs">未开放</span>
              </div>
            </div>
            <div className="space-y-2">
              <Button onClick={onClose} className="w-full bg-slate-700 hover:bg-slate-600 text-xs h-8">关闭</Button>
              <Button onClick={() => {
                if (confirm('确定退出游戏吗？')) { onExit?.() }
              }} className="w-full bg-red-700 hover:bg-red-600 text-xs h-8">退出游戏</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (popup.type === 'rules') {
    return <RulesPopup onClose={onClose} />
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
