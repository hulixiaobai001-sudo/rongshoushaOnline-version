import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { GameState, GamePhase, Location, Identity, Winner, GameEvent } from '@/types/game';
import { generateId, generateRandomMap as genRandomMap, getLocationEffectByName, HERO_POOL_V1_1_IDS } from '@/data/gameData';
import { HERO_POOL } from '@/data/heroData';

const initialState: GameState = {
  phase: 'setup',
  round: 1,
  players: [],
  locations: [],
  events: [],
  blockedLocations: [],
  isPlaying: false,
  winner: null,
  killerCount: 2,
  civilianCount: 6,
  tempLocations: [],
  heroPoolEnabled: true,
  selectedHeroIds: ['xiling', 'kexiong', 'niangao', 'lilongxiang', 'zhangyang', 'fengming', 'wangli', 'yeyu', 'yanzhuo', 'tianyi', 'baiye', 'zhuxun'],
  kungFuActivePlayers: [],
  pendingAttacks: [],
  usedSkills: {},
  locationVisits: {},
  shrineVisionActive: false,
  shrineVisionPlayerId: null,
  cutConnections: [],
  trackedPlayerId: null,
  trackRecords: [],
  droneLocationId: null,
  dronePlayerId: null,
  droneRound: 0,
  roundSkillUsage: {},
};

// 阶段顺序
const phaseOrder: GamePhase[] = [
  'setup',
  'identity',
  'start',
  'investigate1',
  'action1',
  'settlement1',
  'move1',
  'investigate2',
  'action2',
  'settlement2',
  'move2',
  'investigate3',
  'action3',
  'settlement3',
  'move4',
  'investigate4',
  'action4',
  'settlement4',
  'shrine_vision',
  'death_report',
  'speak',
  'vote',
  'end',
];

// 下一个阶段
function getNextPhase(phase: GamePhase): GamePhase {
  const idx = phaseOrder.indexOf(phase);
  if (idx >= 0 && idx < phaseOrder.length - 1) {
    return phaseOrder[idx + 1];
  }
  return phase;
}

interface GameStore extends GameState {
  // 设置阶段
  setKillerCount: (count: number) => void;
  setCivilianCount: (count: number) => void;
  addPlayer: (name: string) => void;
  removePlayer: (id: string) => void;
  updatePlayerName: (id: string, name: string) => void;

  // 地图编辑
  addLocation: (name: string, x: number, y: number) => void;
  removeLocation: (id: string) => void;
  updateLocationName: (id: string, name: string) => void;
  moveLocation: (id: string, x: number, y: number) => void;
  toggleConnection: (locA: string, locB: string) => void;
  removeConnection: (locA: string, locB: string) => void;  // 地图编辑器用（不记录到cutConnections）
  severConnection: (locA: string, locB: string) => void;   // 张扬断路技能用（记录到cutConnections）
  setTempLocations: (locs: Location[]) => void;
  commitMap: () => void;
  loadDefaultMap: () => void;
  generateRandomMap: () => void;

  // 游戏流程
  assignIdentities: () => void;
  assignHeroes: () => void;
  startPlacement: () => void;
  randomPlaceAll: () => void;
  nextPhase: () => void;
  resetGame: () => void;

  // 英雄系统
  toggleHeroPool: () => void;
  setSelectedHeroes: (heroIds: string[]) => void;

  // 游戏操作
  movePlayer: (playerId: string, locationId: string) => void;
  killPlayer: (playerId: string, attackerId?: string) => void;   // 标记为濒死（attackerId 用于功夫反击判定）
  confirmDeaths: () => void;                  // 结算阶段：濒死→死亡
  checkWinCondition: () => Winner;            // 检查胜利条件
  castVote: (voterId: string, targetId: string) => void;
  clearVotes: () => void;
  submitVotes: (votes: Array<{ voterId: string; targetId: string }>) => void;

  // 功夫技能
  activateKungFu: (playerId: string) => void;  // 激活功夫（年糕）
  clearKungFu: () => void;                     // 清空功夫状态（进入新 action 阶段时）

  // 枪毙技能（李龙祥 - 投票阶段）
  executeGunShot: (shooterId: string, targetId: string) => void;

  // 追踪技能（白野）
  setTrackedPlayer: (playerId: string) => void;
  addTrackRecord: (actorId: string, action: string, locationId?: string) => void;

  // 停步效果（过肩摔/潜伏/大力射门）
  applyHalt: (playerId: string) => void;

  // 传送技能（冯明）
  activateTeleport: (playerId: string) => void;

  // 疾行技能（竹隼）
  activateDoubleMove: (playerId: string) => void;

  
  // 每轮重置技能使用计数（once_per_round 技能）
  incrementRoundSkillUsage: (skillId: string) => void;
  setDrone: (playerId: string, locationId: string) => void;
  decrementRoundSkillUsage: (skillId: string) => void;
  

  // 杀手攻击次数消耗
  consumeAttackCharge: (playerId: string, locationEffectType?: string) => void;
  

  // 日志
  addEvent: (event: Omit<GameEvent, 'id' | 'timestamp'>) => void;
}

export const useGameStore = create<GameStore>()(
  immer((set) => ({
    ...initialState,

    // ============================================
    // 设置阶段
    // ============================================

    setKillerCount: (count) =>
      set((state) => { state.killerCount = Math.max(1, count); }),

    setCivilianCount: (count) =>
      set((state) => { state.civilianCount = Math.max(1, count); }),

    addPlayer: (name) =>
      set((state) => {
        state.players.push({
          id: generateId('player'),
          name,
          identity: 'civilian',
          status: 'alive',
          locationId: '',
          isRevealed: false,
          votedFor: null,
          voteCount: 0,
          heroId: '',
          halted: false,
          teleportReady: false,
          doubleMoveActive: false,
          doubleMoveFirstDone: false,
          normalAttackRemaining: 1,
          asylumAttackRemaining: 1,
        });
      }),

    removePlayer: (id) =>
      set((state) => { state.players = state.players.filter((p) => p.id !== id); }),

    updatePlayerName: (id, name) =>
      set((state) => {
        const p = state.players.find((pl) => pl.id === id);
        if (p) p.name = name;
      }),

    // ============================================
    // 地图编辑
    // ============================================

    addLocation: (name, x, y) =>
      set((state) => {
        state.tempLocations.push({
          id: generateId('loc'),
          name,
          connectedTo: [],
          isBlocked: false,
          x,
          y,
        });
      }),

    removeLocation: (id) =>
      set((state) => {
        state.tempLocations = state.tempLocations.filter((l) => l.id !== id);
        state.tempLocations.forEach((l) => {
          l.connectedTo = l.connectedTo.filter((c) => c !== id);
        });
      }),

    updateLocationName: (id, name) =>
      set((state) => {
        const loc = state.tempLocations.find((l) => l.id === id);
        if (loc) loc.name = name;
      }),

    moveLocation: (id, x, y) =>
      set((state) => {
        const loc = state.tempLocations.find((l) => l.id === id);
        if (loc) { loc.x = x; loc.y = y; }
      }),

    toggleConnection: (locA, locB) =>
      set((state) => {
        const a = state.tempLocations.find((l) => l.id === locA);
        const b = state.tempLocations.find((l) => l.id === locB);
        if (!a || !b || locA === locB) return;
        if (a.connectedTo.includes(locB)) {
          a.connectedTo = a.connectedTo.filter((c) => c !== locB);
          b.connectedTo = b.connectedTo.filter((c) => c !== locA);
        } else {
          a.connectedTo.push(locB);
          b.connectedTo.push(locA);
        }
      }),

    removeConnection: (locA, locB) =>
      set((state) => {
        const a = state.tempLocations.find((l) => l.id === locA);
        const b = state.tempLocations.find((l) => l.id === locB);
        if (a) a.connectedTo = a.connectedTo.filter((c) => c !== locB);
        if (b) b.connectedTo = b.connectedTo.filter((c) => c !== locA);
      }),

    severConnection: (locA, locB) =>
      set((state) => {
        // 记录被切断的道路（用于地图显示红×）
        const alreadyCut = state.cutConnections.some(
          (c) => (c.locA === locA && c.locB === locB) || (c.locA === locB && c.locB === locA)
        );
        if (!alreadyCut) {
          state.cutConnections.push({ locA, locB });
        }
        // 从实际游戏地图中移除连接
        const gameA = state.locations.find((l) => l.id === locA);
        const gameB = state.locations.find((l) => l.id === locB);
        if (gameA) gameA.connectedTo = gameA.connectedTo.filter((c) => c !== locB);
        if (gameB) gameB.connectedTo = gameB.connectedTo.filter((c) => c !== locA);
        // 同时从临时地图中移除
        const tempA = state.tempLocations.find((l) => l.id === locA);
        const tempB = state.tempLocations.find((l) => l.id === locB);
        if (tempA) tempA.connectedTo = tempA.connectedTo.filter((c) => c !== locB);
        if (tempB) tempB.connectedTo = tempB.connectedTo.filter((c) => c !== locA);
      }),

    setTrackedPlayer: (playerId) =>
      set((state) => {
        state.trackedPlayerId = playerId;
      }),

    addTrackRecord: (actorId, action, locationId) =>
      set((state) => {
        // 只有被追踪的目标玩家执行的操作才记录
        if (state.trackedPlayerId !== actorId) return;
        state.trackRecords.push({
          round: state.round,
          phase: state.phase,
          action,
          locationId,
        });
      }),

    applyHalt: (playerId) =>
      set((state) => {
        const player = state.players.find((p) => p.id === playerId);
        if (player) player.halted = true;
      }),

    activateTeleport: (playerId) =>
      set((state) => {
        const player = state.players.find((p) => p.id === playerId);
        if (player) player.teleportReady = true;
      }),
    setDrone: (playerId, locationId) =>
      set((state) => {
        state.dronePlayerId = playerId;
        state.droneLocationId = locationId;
        state.droneRound = state.round;
      }),

    activateDoubleMove: (playerId) =>
      set((state) => {
        const player = state.players.find((p) => p.id === playerId);
        if (player) {
          player.doubleMoveActive = true;
          player.doubleMoveFirstDone = false;
        }
      }),

    // 每轮重置技能使用计数（once_per_round 技能）
    incrementRoundSkillUsage: (skillId) =>
      set((state) => {
        state.roundSkillUsage[skillId] = (state.roundSkillUsage[skillId] || 0) + 1;
      }),

    decrementRoundSkillUsage: (skillId) =>
      set((state) => {
        state.roundSkillUsage[skillId] = Math.max(0, (state.roundSkillUsage[skillId] || 0) - 1);
      }),

    // 杀手攻击次数消耗：在阿萨姆疯人院消耗 asylumAttackRemaining，否则消耗 normalAttackRemaining
    consumeAttackCharge: (playerId, locationEffectType) =>
      set((state) => {
        const player = state.players.find((p) => p.id === playerId);
        if (!player || player.identity !== 'killer') return;
        if (locationEffectType === 'asylum_extra_attack') {
          player.asylumAttackRemaining = Math.max(0, player.asylumAttackRemaining - 1);
        } else {
          player.normalAttackRemaining = Math.max(0, player.normalAttackRemaining - 1);
        }
      }),

    setTempLocations: (locs) =>
      set((state) => { state.tempLocations = locs; }),

    commitMap: () =>
      set((state) => { state.locations = [...state.tempLocations]; }),

    loadDefaultMap: () =>
      set((state) => {
        const locs: Location[] = [
          { id: 'loc_zhongxin', name: '中心公园', connectedTo: ['loc_yidui', 'loc_shangye', 'loc_asam'], isBlocked: false, x: 50, y: 35 },
          { id: 'loc_yidui', name: '一大队', connectedTo: ['loc_zhongxin', 'loc_nancuiping', 'loc_jikong'], isBlocked: false, x: 75, y: 35 },
          { id: 'loc_shangye', name: '商业街', connectedTo: ['loc_zhongxin', 'loc_asam'], isBlocked: false, x: 25, y: 30 },
          { id: 'loc_asam', name: '阿萨姆疯人院', connectedTo: ['loc_shangye', 'loc_zhongxin'], isBlocked: false, x: 50, y: 12 },
          { id: 'loc_nancuiping', name: '南翠屏公园', connectedTo: ['loc_lingyu', 'loc_yidui'], isBlocked: false, x: 80, y: 60 },
          { id: 'loc_lingyu', name: '凌宇神社', connectedTo: ['loc_nancuiping', 'loc_zhicheng'], isBlocked: false, x: 60, y: 80 },
          { id: 'loc_zhicheng', name: '志成桥', connectedTo: ['loc_lingyu', 'loc_jikong'], isBlocked: false, x: 40, y: 85 },
          { id: 'loc_jikong', name: '疾控中心', connectedTo: ['loc_zhicheng', 'loc_yidui'], isBlocked: false, x: 30, y: 60 },
        ];
        // 为每个地点绑定效果
        locs.forEach((loc) => {
          loc.effect = getLocationEffectByName(loc.name);
        });
        state.tempLocations = locs;
        state.locations = locs;
      }),

    generateRandomMap: () =>
      set((state) => {
        const locs = genRandomMap();
        state.tempLocations = locs;
        state.locations = locs;
        state.events.push({
          id: generateId('evt'), round: state.round, phase: state.phase,
          timestamp: Date.now(), type: 'info',
          description: `已随机生成地图，共 ${locs.length} 个地点：${locs.map((l) => l.name).join('、')}`,
        });
      }),

    // ============================================
    // 游戏流程
    // ============================================

    assignIdentities: () =>
      set((state) => {
        const totalPlayers = state.players.length;
        const identities: Identity[] = [];
        for (let i = 0; i < state.killerCount; i++) identities.push('killer');
        for (let i = 0; i < state.civilianCount; i++) identities.push('civilian');
        if (identities.length < totalPlayers) {
          while (identities.length < totalPlayers) identities.push('civilian');
        } else if (identities.length > totalPlayers) {
          while (identities.length > totalPlayers) {
            const lastCivIndex = identities.lastIndexOf('civilian');
            if (lastCivIndex !== -1) identities.splice(lastCivIndex, 1);
            else identities.pop();
          }
        }
        for (let i = identities.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [identities[i], identities[j]] = [identities[j], identities[i]];
        }
        state.players.forEach((p, i) => { p.identity = identities[i]; });
        state.phase = 'identity';
        state.events.push({
          id: generateId('evt'), round: 1, phase: 'identity',
          timestamp: Date.now(), type: 'info',
          description: `身份已分配：${state.killerCount}个杀手，${state.civilianCount}个平民`,
        });
      }),

    assignHeroes: () =>
      set((state) => {
        if (!state.heroPoolEnabled) return;
        // 使用英雄池1.1
        const pool = [...HERO_POOL_V1_1_IDS];
        // Fisher-Yates 随机打乱
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        // 不重复分配：每个玩家分配一个唯一英雄，英雄用尽则后续玩家不分配
        const assignedHeroNames: string[] = [];
        state.players.forEach((p, i) => {
          if (i < pool.length) {
            p.heroId = pool[i];
            const h = HERO_POOL.find((hero) => hero.id === pool[i]);
            if (h) assignedHeroNames.push(h.name);
          } else {
            p.heroId = ''; // 英雄用尽，不分配
          }
        });
        const unassignedCount = state.players.length - assignedHeroNames.length;
        state.events.push({
          id: generateId('evt'), round: 1, phase: 'identity',
          timestamp: Date.now(), type: 'info',
          description: `【英雄池1.2】英雄已分配：${assignedHeroNames.join(', ')}${unassignedCount > 0 ? `（${unassignedCount}名玩家未分配到英雄）` : ''}`,
        });
      }),

    startPlacement: () =>
      set((state) => { state.phase = 'start'; state.isPlaying = true; }),

    randomPlaceAll: () =>
      set((state) => {
        const availableLocs = state.locations.filter((l) => !l.isBlocked);
        if (availableLocs.length === 0) return;
        state.players.forEach((p) => {
          if (!p.locationId) {
            const randomLoc = availableLocs[Math.floor(Math.random() * availableLocs.length)];
            p.locationId = randomLoc.id;
          }
        });
        state.events.push({
          id: generateId('evt'), round: 1, phase: 'start',
          timestamp: Date.now(), type: 'info',
          description: `所有玩家已随机分配到地图`,
        });
      }),

    // ============================================
    // nextPhase - 核心阶段推进
    // ============================================

    nextPhase: () =>
      set((state) => {
        const currentIdx = phaseOrder.indexOf(state.phase);
        if (currentIdx < 0 || currentIdx >= phaseOrder.length - 1) return;

        // 投票阶段结束
        if (state.phase === 'vote') {
          handleVoteEnd(state);
          return;
        }

        // 结算阶段：handleSettlement 内部已处理阶段推进
        if (state.phase.startsWith('settlement')) {
          handleSettlement(state);
          return;
        }

        // 凌宇神社查看阶段：直接进入死亡播报
        if (state.phase === 'shrine_vision') {
          state.shrineVisionActive = false;
          state.shrineVisionPlayerId = null;
          const next = getNextPhase(state.phase);
          state.phase = next;
          state.events.push({
            id: generateId('evt'), round: state.round, phase: next,
            timestamp: Date.now(), type: 'phase_change',
            description: `神视结束，进入${getPhaseName(next)}`,
          });
          return;
        }

        // 死亡播报阶段：封锁死亡地点
        if (state.phase === 'death_report') {
          handleDeathReport(state);
          return;
        }

        // 普通阶段推进
        const next = getNextPhase(state.phase);

        // 离开移动阶段时，清除所有停步效果（停步只生效一个移动阶段）
        if (state.phase.startsWith('move')) {
          state.players.forEach((p) => {
            if (p.halted) p.halted = false;
          });
        }

        // 进入新的 action 阶段时，清空功夫状态
        if (next.startsWith('action')) {
          state.kungFuActivePlayers = [];
        }

        state.phase = next;
        state.events.push({
          id: generateId('evt'), round: state.round, phase: next,
          timestamp: Date.now(), type: 'phase_change',
          description: `进入${getPhaseName(next)}`,
        });
      }),

    // ============================================
    // 游戏操作
    // ============================================

    movePlayer: (playerId, locationId) =>
      set((state) => {
        const player = state.players.find((p) => p.id === playerId);
        if (!player || player.status !== 'alive') return;
        // 停步检查：拥有停步效果的玩家在移动阶段无法移动
        if (player.halted && state.phase.startsWith('move')) {
          state.events.push({
            id: generateId('evt'), round: state.round, phase: state.phase,
            timestamp: Date.now(), type: 'info',
            description: `${player.name} 拥有"停步"，跳过本移动阶段`,
          });
          return;
        }
        const toLoc = state.locations.find((l) => l.id === locationId);
        player.locationId = locationId;
        // 阿萨姆疯人院【癫狂】效果：每次进入时疯人院攻击次数+1
        if (toLoc?.effect?.type === 'asylum_extra_attack' && player.identity === 'killer') {
          player.asylumAttackRemaining += 1;
          state.events.push({
            id: generateId('evt'), round: state.round, phase: state.phase,
            timestamp: Date.now(), type: 'info',
            playerId: player.id, locationId,
            description: `【癫狂】${player.name} 进入阿萨姆疯人院，疯人院攻击次数+1（剩余${player.asylumAttackRemaining}次）`,
          });
        }
        // 移动成功后清除传送状态（传送是一次性的）
        if (player.teleportReady) player.teleportReady = false;
        // 疾行：处理两格移动
        if (player.doubleMoveActive) {
          if (!player.doubleMoveFirstDone) {
            // 第一次移动，标记已完成
            player.doubleMoveFirstDone = true;
          } else {
            // 第二次移动，疾行用完
            player.doubleMoveActive = false;
            player.doubleMoveFirstDone = false;
          }
        }
        // 记录地点经过（凌宇神社效果使用）
        if (!state.locationVisits[locationId]) {
          state.locationVisits[locationId] = [];
        }
        // 去重：同一轮中同一玩家只记录一次
        if (!state.locationVisits[locationId].includes(playerId)) {
          state.locationVisits[locationId].push(playerId);
        }
        // 如果被移动的玩家是被白野追踪的目标，记录追踪
        if (state.trackedPlayerId === playerId && toLoc) {
          state.trackRecords.push({
            round: state.round,
            phase: state.phase,
            action: `移动到 ${toLoc.name}`,
            locationId,
          });
        }
      }),

    /** 记录一次攻击（行动阶段使用，不立即处理死亡，结算阶段统一结算） */
    killPlayer: (targetId, attackerId) =>
      set((state) => {
        if (!attackerId) return;
        const target = state.players.find((p) => p.id === targetId);
        const attacker = state.players.find((p) => p.id === attackerId);
        if (!target || !attacker || target.status !== 'alive' || attacker.status !== 'alive') return;

        // 只记录攻击，不立即处理
        state.pendingAttacks.push({
          attackerId,
          targetId,
          actionPhase: String(state.phase),
        });

        const targetLoc = state.locations.find((l) => l.id === target.locationId);
        const hasKungFu = state.kungFuActivePlayers.includes(targetId);
        state.events.push({
          id: generateId('evt'), round: state.round, phase: state.phase,
          timestamp: Date.now(), type: 'attack',
          playerId: attackerId, targetId,
          locationId: target.locationId,
          description: `${attacker.name} → ${target.name}（${targetLoc ? targetLoc.name : ''}）${hasKungFu ? '【功夫反弹待发】' : ''}`,
        });
      }),

    /** 结算阶段：濒死→死亡 */
    confirmDeaths: () =>
      set((state) => {
        const dyingPlayers = state.players.filter((p) => p.status === 'dying');
        dyingPlayers.forEach((player) => {
          player.status = 'dead';
          player.isRevealed = true;
          // 封锁死亡地点
          const loc = state.locations.find((l) => l.id === player.locationId);
          if (loc) {
            loc.isBlocked = true;
            if (!state.blockedLocations.includes(player.locationId)) {
              state.blockedLocations.push(player.locationId);
            }
          }
          state.events.push({
            id: generateId('evt'), round: state.round, phase: state.phase,
            timestamp: Date.now(), type: 'settlement',
            playerId: player.id, locationId: player.locationId,
            description: `${player.name}（${player.identity === 'killer' ? '杀手' : '平民'}）在${loc ? loc.name : '未知地点'}死亡，该地点被封锁`,
          });
        });
      }),

    /** 检查胜利条件 */
    checkWinCondition: () => {
      let winner: Winner = null;
      set((state) => {
        const aliveKillers = state.players.filter((p) => p.status === 'alive' && p.identity === 'killer').length;
        const aliveCivilians = state.players.filter((p) => p.status === 'alive' && p.identity === 'civilian').length;

        // 好人胜利：所有杀手死亡
        if (aliveKillers === 0) {
          winner = 'good';
          state.winner = 'good';
          state.phase = 'end';
          state.events.push({
            id: generateId('evt'), round: state.round, phase: 'end',
            timestamp: Date.now(), type: 'win',
            description: '好人阵营胜利！所有杀手已被消灭',
          });
          return;
        }

        // 杀手胜利：好人数量 <= 杀手数量
        if (aliveCivilians <= aliveKillers) {
          winner = 'evil';
          state.winner = 'evil';
          state.phase = 'end';
          state.events.push({
            id: generateId('evt'), round: state.round, phase: 'end',
            timestamp: Date.now(), type: 'win',
            description: '杀手阵营胜利！好人数量已不足',
          });
          return;
        }

        winner = null;
      });
      return winner;
    },

    castVote: (voterId, targetId) =>
      set((state) => {
        const voter = state.players.find((p) => p.id === voterId);
        const target = state.players.find((p) => p.id === targetId);
        if (voter && target && voter.status === 'alive') {
          if (voter.votedFor) {
            const prev = state.players.find((p) => p.id === voter.votedFor);
            if (prev) prev.voteCount--;
          }
          voter.votedFor = targetId;
          target.voteCount++;
        }
      }),

    clearVotes: () =>
      set((state) => {
        state.players.forEach((p) => { p.votedFor = null; p.voteCount = 0; });
      }),

    submitVotes: (votes) =>
      set((state) => {
        state.players.forEach((p) => { p.votedFor = null; p.voteCount = 0; });
        votes.forEach(({ voterId, targetId }) => {
          const voter = state.players.find((p) => p.id === voterId);
          const target = state.players.find((p) => p.id === targetId);
          if (voter && target && voter.status === 'alive' && target.status === 'alive') {
            voter.votedFor = targetId;
            target.voteCount++;
          }
        });
      }),

    // ============================================
    // 功夫技能
    // ============================================

    activateKungFu: (playerId) =>
      set((state) => {
        if (!state.kungFuActivePlayers.includes(playerId)) {
          state.kungFuActivePlayers.push(playerId);
          const player = state.players.find((p) => p.id === playerId);
          state.events.push({
            id: generateId('evt'), round: state.round, phase: state.phase,
            timestamp: Date.now(), type: 'info',
            playerId,
            description: `${player ? player.name : '某角色'} 激活了【功夫】，本行动阶段内任何同房间攻击都将被反击`,
          });
        }
      }),

    clearKungFu: () =>
      set((state) => { state.kungFuActivePlayers = []; }),

    // ============================================
    // 枪毙技能（李龙祥 - 投票阶段）
    // ============================================

    executeGunShot: (shooterId, targetId) =>
      set((state) => {
        const shooter = state.players.find((p) => p.id === shooterId);
        const target = state.players.find((p) => p.id === targetId);
        if (!shooter || !target) return;
        if (shooter.status !== 'alive' || target.status !== 'alive') return;

        // 检查技能是否已使用
        const used = state.usedSkills[shooterId] || [];
        if (used.includes('lilongxiang_gunshot')) return; // 已使用过

        // 标记技能已使用
        if (!state.usedSkills[shooterId]) state.usedSkills[shooterId] = [];
        state.usedSkills[shooterId].push('lilongxiang_gunshot');

        // 目标死亡并暴露身份
        target.status = 'dead';
        target.isRevealed = true;

        state.events.push({
          id: generateId('evt'), round: state.round, phase: 'vote',
          timestamp: Date.now(), type: 'death',
          playerId: target.id,
          description: `【枪毙】${shooter.name} 枪决了 ${target.name}！${target.name} 是 ${target.identity === 'killer' ? '杀手' : '平民'}`,
        });

        // 如果目标是平民（好人），李龙祥也死亡
        if (target.identity === 'civilian') {
          shooter.status = 'dead';
          shooter.isRevealed = true;
          state.events.push({
            id: generateId('evt'), round: state.round, phase: 'vote',
            timestamp: Date.now(), type: 'death',
            playerId: shooter.id,
            description: `【枪毙反噬】${shooter.name} 枪决了好人，正义的反噬使其死亡！${shooter.name} 是 ${shooter.identity === 'killer' ? '杀手' : '平民'}`,
          });
        }

        // 胜利条件判定
        const aliveKillers = state.players.filter((p) => p.status === 'alive' && p.identity === 'killer').length;
        const aliveCivilians = state.players.filter((p) => p.status === 'alive' && p.identity === 'civilian').length;

        if (aliveKillers === 0) {
          state.winner = 'good';
          state.phase = 'end';
          state.events.push({
            id: generateId('evt'), round: state.round, phase: 'end',
            timestamp: Date.now(), type: 'win',
            description: '好人阵营胜利！所有杀手已被消灭',
          });
          return;
        }

        if (aliveCivilians <= aliveKillers) {
          state.winner = 'evil';
          state.phase = 'end';
          state.events.push({
            id: generateId('evt'), round: state.round, phase: 'end',
            timestamp: Date.now(), type: 'win',
            description: `杀手阵营胜利！好人(${aliveCivilians})已不足对抗杀手(${aliveKillers})`,
          });
          return;
        }
      }),

    // ============================================
    // 英雄系统
    // ============================================

    toggleHeroPool: () =>
      set((state) => { state.heroPoolEnabled = !state.heroPoolEnabled; }),

    setSelectedHeroes: (heroIds) =>
      set((state) => { state.selectedHeroIds = heroIds; }),

    // ============================================
    // 其他
    // ============================================

    addEvent: (event) =>
      set((state) => {
        state.events.push({ ...event, id: generateId('evt'), timestamp: Date.now() });
      }),

    resetGame: () =>
      set((state) => {
        const tempLocs = state.tempLocations;
        const heroEnabled = state.heroPoolEnabled;
        const heroIds = state.selectedHeroIds;
        Object.assign(state, initialState);
        state.tempLocations = tempLocs;
        state.heroPoolEnabled = heroEnabled;
        state.selectedHeroIds = heroIds;
        state.usedSkills = {};
        state.locationVisits = {};
        state.cutConnections = [];
        state.roundSkillUsage = {};
        state.players.forEach((p) => {
          p.halted = false;
          p.teleportReady = false;
          p.doubleMoveActive = false;
          p.doubleMoveFirstDone = false;
          p.normalAttackRemaining = 1;
          p.asylumAttackRemaining = 1;
        });
        state.trackedPlayerId = null;
        state.trackRecords = [];
        state.droneLocationId = null;
        state.dronePlayerId = null;
        state.droneRound = 0;
      }),
  }))
);

// ============================================
// 辅助函数（在 immer 外部）
// ============================================

/** 处理投票结束 */
function handleVoteEnd(state: GameState) {
  // 找出被投票最多的玩家
  const maxVotes = Math.max(...state.players.map((p) => p.voteCount));
  if (maxVotes > 0) {
    // 找到所有得票最高的玩家（处理平票：都淘汰）
    const eliminated = state.players.filter((p) => p.voteCount === maxVotes && p.status === 'alive');
    eliminated.forEach((player) => {
      player.status = 'dead';
      player.isRevealed = true;
      // 注意：投票出局不封锁地点
      state.events.push({
        id: generateId('evt'), round: state.round, phase: 'vote',
        timestamp: Date.now(), type: 'death',
        playerId: player.id,
        description: `${player.name} 被投票出局（${player.identity === 'killer' ? '杀手' : '平民'}）`,
      });
    });
  }

  // 清除投票
  state.players.forEach((p) => { p.votedFor = null; p.voteCount = 0; });

  // 清空尸体：将所有死亡玩家的 locationId 置空
  let clearedCorpses: string[] = [];
  state.players.forEach((p) => {
    if (p.status === 'dead' && p.locationId) {
      clearedCorpses.push(p.name);
      p.locationId = '';
    }
  });
  if (clearedCorpses.length > 0) {
    state.events.push({
      id: generateId('evt'), round: state.round, phase: 'vote',
      timestamp: Date.now(), type: 'info',
      description: `尸体已被清理：${clearedCorpses.join('、')}`,
    });
  }

  // 将存活角色随机放置到未封锁地点
  const availableLocs = state.locations.filter((l) => !l.isBlocked);
  if (availableLocs.length > 0) {
    state.players.filter((p) => p.status === 'alive').forEach((p) => {
      const randomLoc = availableLocs[Math.floor(Math.random() * availableLocs.length)];
      p.locationId = randomLoc.id;
    });
  }

  // 投票阶段结束时清除所有停步效果，重置杀手攻击计数器
  state.players.forEach((p) => {
    if (p.halted) p.halted = false;
    if (p.identity === 'killer') {
      p.normalAttackRemaining = 1;
      p.asylumAttackRemaining = 1;
    }
  });

  // 白野【追踪】：每轮结束时显示追踪结果并清空
  if (state.trackedPlayerId && state.trackRecords.length > 0) {
    const trackedPlayer = state.players.find((p) => p.id === state.trackedPlayerId);
    if (trackedPlayer) {
      const trackSummary = state.trackRecords.map((r) => {
        const loc = state.locations.find((l) => l.id === r.locationId);
        return `【${r.phase}】${r.action}${loc ? `（${loc.name}）` : ''}`;
      }).join(' → ');
      state.events.push({
        id: generateId('evt'), round: state.round - 1, phase: 'vote',
        timestamp: Date.now(), type: 'info',
        description: `【追踪报告】${trackedPlayer.name} 本轮行动记录：${trackSummary}`,
      });
    }
    state.trackedPlayerId = null;
    state.trackRecords = [];
  }

  //江枫【无人机】
  if (state.droneLocationId && state.dronePlayerId) {
    const droneLoc = state.locations.find((l) => l.id === state.droneLocationId);
    const dronePlayer = state.players.find((p) => p.id === state.dronePlayerId);
    const visits = state.locationVisits[state.droneLocationId] || [];
    const visitorNames = visits
      .map((id) => state.players.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => p!.name);
    if (droneLoc && dronePlayer) {
      state.events.push({
        id: generateId('evt'), round: state.round, phase: 'vote',
        timestamp: Date.now(), type: 'info',
        description: `【侦察无人机】${dronePlayer.name} 放置在 ${droneLoc.name} 的无人机报告：本轮经过人员${visitorNames.length > 0 ? '：' + visitorNames.join('、') : '：无'}`,
      });
    }
    state.droneLocationId = null;
    state.dronePlayerId = null;
    state.droneRound = 0;
  }
  // 回合+1，清空地点经过记录和每轮重置技能计数
  state.round += 1;
  state.locationVisits = {};
  state.roundSkillUsage = {};

  

  state.phase = 'investigate1';

  state.events.push({
    id: generateId('evt'), round: state.round, phase: 'investigate1',
    timestamp: Date.now(), type: 'phase_change',
    description: `投票结束，进入第${state.round}轮探查阶段`,
  });
}

/** 处理结算阶段 - 统一结算 pendingAttacks */
function handleSettlement(state: GameState) {
  // 1. 结算所有待处理的攻击（先只标记死亡，不触发地点效果）
  const attacks = [...state.pendingAttacks];
  const deathList: string[] = []; // 本轮死亡的玩家ID列表

  if (attacks.length > 0) {
    attacks.forEach((attack) => {
      const attacker = state.players.find((p) => p.id === attack.attackerId);
      const target = state.players.find((p) => p.id === attack.targetId);
      if (!attacker || !target) return;
      // 如果攻击者或目标已经死亡，跳过
      if (attacker.status !== 'alive' || target.status !== 'alive') return;

      // 检查目标是否有功夫激活
      if (state.kungFuActivePlayers.includes(target.id)) {
        // 功夫反弹！攻击者死亡
        attacker.status = 'dead';
        attacker.isRevealed = true;
        deathList.push(attacker.id);
        const attackerLoc = state.locations.find((l) => l.id === attacker.locationId);
        state.events.push({
          id: generateId('evt'), round: state.round, phase: state.phase,
          timestamp: Date.now(), type: 'settlement',
          playerId: attacker.id, locationId: attacker.locationId,
          description: `【功夫反弹】${attacker.name} 攻击 ${target.name} 被反弹！${attacker.name}（${attacker.identity === 'killer' ? '杀手' : '平民'}）在${attackerLoc ? attackerLoc.name : '未知地点'}死亡`,
        });
      } else {
        // 普通击杀：目标死亡
        target.status = 'dead';
        target.isRevealed = true;
        deathList.push(target.id);
        const targetLoc = state.locations.find((l) => l.id === target.locationId);
        state.events.push({
          id: generateId('evt'), round: state.round, phase: state.phase,
          timestamp: Date.now(), type: 'settlement',
          playerId: target.id, locationId: target.locationId,
          description: `${target.name}（${target.identity === 'killer' ? '杀手' : '平民'}）在${targetLoc ? targetLoc.name : '未知地点'}死亡`,
        });
      }
    });
  } else {
    state.events.push({
      id: generateId('evt'), round: state.round, phase: state.phase,
      timestamp: Date.now(), type: 'settlement',
      description: '本回合无攻击事件',
    });
  }

  // 2. 统一处理死亡地点效果（确保所有死亡都被记录后再处理）
  // 先处理南翠屏公园（可能导致额外死亡）
  const newDeathsFromCascade: string[] = [];
  deathList.forEach((playerId) => {
    const deadPlayer = state.players.find((p) => p.id === playerId);
    if (!deadPlayer || deadPlayer.status !== 'dead') return;
    const deathLoc = state.locations.find((l) => l.id === deadPlayer.locationId);
    if (deathLoc?.effect?.type === 'mass_civilian_death') {
      const civiliansInLoc = state.players.filter(
        (p) => p.status === 'alive' && p.identity === 'civilian' && p.locationId === deadPlayer.locationId
      );
      civiliansInLoc.forEach((civ) => {
        civ.status = 'dead';
        civ.isRevealed = true;
        newDeathsFromCascade.push(civ.id);
        state.events.push({
          id: generateId('evt'), round: state.round, phase: state.phase,
          timestamp: Date.now(), type: 'settlement',
          playerId: civ.id, locationId: civ.locationId,
          description: `【南翠屏公园】${civ.name}（平民）受到连锁反应影响，同时死亡`,
        });
      });
    }
  });

  // 合并所有死亡列表（攻击死亡 + 连锁死亡）
  const allDeaths = [...deathList, ...newDeathsFromCascade];

  // 再统一处理疾控中心感染（所有在疾控中心死亡的玩家都不会死）
  allDeaths.forEach((playerId) => {
    const deadPlayer = state.players.find((p) => p.id === playerId);
    if (!deadPlayer || deadPlayer.status !== 'dead') return;
    const deathLoc = state.locations.find((l) => l.id === deadPlayer.locationId);
    if (deathLoc?.effect?.type === 'identity_transform') {
      // 所有在疾控中心死亡的玩家都感染复活
      deadPlayer.status = 'alive';
      if (deadPlayer.identity === 'civilian') {
        // 平民：感染后身份转变为杀手
        deadPlayer.identity = 'killer';
        state.events.push({
          id: generateId('evt'), round: state.round, phase: state.phase,
          timestamp: Date.now(), type: 'settlement',
          playerId: deadPlayer.id, locationId: deadPlayer.locationId,
          description: `【疾控中心】${deadPlayer.name} 被病毒感染！死而复生，身份从平民转变为杀手`,
        });
      } else {
        // 杀手：感染后复活但不改变身份（本来就是杀手）
        state.events.push({
          id: generateId('evt'), round: state.round, phase: state.phase,
          timestamp: Date.now(), type: 'settlement',
          playerId: deadPlayer.id, locationId: deadPlayer.locationId,
          description: `【疾控中心】${deadPlayer.name} 被病毒感染！死而复生，杀手不受影响`,
        });
      }
    }
  });

  // 3. 清空攻击队列和功夫状态
  state.pendingAttacks = [];
  state.kungFuActivePlayers = [];

  // 4. 胜利条件判定
  const aliveKillers = state.players.filter((p) => p.status === 'alive' && p.identity === 'killer').length;
  const aliveCivilians = state.players.filter((p) => p.status === 'alive' && p.identity === 'civilian').length;

  // 好人胜利：所有杀手死亡
  if (aliveKillers === 0) {
    state.winner = 'good';
    state.phase = 'end';
    state.events.push({
      id: generateId('evt'), round: state.round, phase: 'end',
      timestamp: Date.now(), type: 'win',
      description: '好人阵营胜利！所有杀手已被消灭',
    });
    return;
  }

  // 杀手胜利：好人数量 <= 杀手数量
  if (aliveCivilians <= aliveKillers) {
    state.winner = 'evil';
    state.phase = 'end';
    state.events.push({
      id: generateId('evt'), round: state.round, phase: 'end',
      timestamp: Date.now(), type: 'win',
      description: `杀手阵营胜利！好人(${aliveCivilians})已不足对抗杀手(${aliveKillers})`,
    });
    return;
  }

  // 5. 凌宇神社效果检查（仅 settlement4）
  if (state.phase === 'settlement4') {
    const shrineLoc = state.locations.find((l) => l.effect?.type === 'shrine_vision');
    if (shrineLoc) {
      // 找到凌宇神社中速度最高的存活玩家
      const shrinePlayers = state.players.filter(
        (p) => p.status === 'alive' && p.locationId === shrineLoc.id
      );
      if (shrinePlayers.length > 0) {
        // 按速度降序排列，取第一个（速度最高）
        const speedMap: Record<string, number> = { xiling: 100, lilongxiang: 2, kexiong: 1, niangao: 0 };
        shrinePlayers.sort((a, b) => (speedMap[b.heroId] || 0) - (speedMap[a.heroId] || 0));
        const fastestPlayer = shrinePlayers[0];
        state.shrineVisionActive = true;
        state.shrineVisionPlayerId = fastestPlayer.id;
        state.phase = 'shrine_vision';
        state.events.push({
          id: generateId('evt'), round: state.round, phase: 'shrine_vision',
          timestamp: Date.now(), type: 'phase_change',
          description: `【凌宇神社】${fastestPlayer.name}（速度${speedMap[fastestPlayer.heroId] || 0}）获得神视能力，可选择一个地点查看本轮经过人员`,
        });
        return;
      }
    }
  }

  // 6. 继续下一阶段
  const next = getNextPhase(state.phase);
  state.phase = next;
  state.events.push({
    id: generateId('evt'), round: state.round, phase: next,
    timestamp: Date.now(), type: 'phase_change',
    description: `结算完成，进入${getPhaseName(next)}`,
  });
}

/** 处理死亡播报阶段 - 封锁所有死亡地点（中心公园除外） */
function handleDeathReport(state: GameState) {
  // 收集本轮死亡角色（本回合死亡的 = dead 状态但地点未封锁的）
  const deadThisRound = state.players.filter((p) => {
    if (p.status !== 'dead') return false;
    // 如果死亡地点还没被封锁，说明是本轮死亡
    const loc = state.locations.find((l) => l.id === p.locationId);
    return loc && !loc.isBlocked;
  });

  // 封锁所有死亡地点（中心公园不会被封锁）
  const blockedLocs: string[] = [];
  const skippedLocs: string[] = [];
  deadThisRound.forEach((player) => {
    const loc = state.locations.find((l) => l.id === player.locationId);
    if (!loc || loc.isBlocked) return;
    // 中心公园不会被封锁
    if (loc.effect?.type === 'unblockable') {
      skippedLocs.push(loc.name);
      return;
    }
    loc.isBlocked = true;
    state.blockedLocations.push(player.locationId);
    blockedLocs.push(loc.name);
  });

  if (skippedLocs.length > 0) {
    state.events.push({
      id: generateId('evt'), round: state.round, phase: 'death_report',
      timestamp: Date.now(), type: 'info',
      description: `【中心公园】安全区效果：${skippedLocs.join('、')}无需封锁`,
    });
  }

  if (blockedLocs.length > 0) {
    state.events.push({
      id: generateId('evt'), round: state.round, phase: 'death_report',
      timestamp: Date.now(), type: 'block',
      description: `死亡地点被封锁：${blockedLocs.join('、')}`,
    });
  } else {
    state.events.push({
      id: generateId('evt'), round: state.round, phase: 'death_report',
      timestamp: Date.now(), type: 'info',
      description: '本轮无死亡地点需要封锁',
    });
  }

  // 进入下一阶段（speak）
  const next = getNextPhase(state.phase);
  state.phase = next;
  state.events.push({
    id: generateId('evt'), round: state.round, phase: next,
    timestamp: Date.now(), type: 'phase_change',
    description: `死亡播报结束，进入${getPhaseName(next)}`,
  });
}

function getPhaseName(phase: GamePhase): string {
  const names: Record<string, string> = {
    setup: '游戏设置', identity: '身份发布', start: '游戏开始',
    investigate1: '探查①', action1: '行动①', settlement1: '结算①',
    move1: '移动②',
    investigate2: '探查②', action2: '行动②', settlement2: '结算②',
    move2: '移动③',
    investigate3: '探查③', action3: '行动③', settlement3: '结算③',
    move4: '移动④',
    investigate4: '探查④', action4: '行动④', settlement4: '结算④',
    speak: '发言', vote: '投票', end: '游戏结束',
  };
  return names[phase] || phase;
}