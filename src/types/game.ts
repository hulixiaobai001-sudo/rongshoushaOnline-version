// ============================================
// 游戏核心类型定义 - 简化版
// ============================================

/** 游戏阶段 */
export type GamePhase =
  | 'setup'           // 设置阶段：配置玩家、身份、地图
  | 'identity'        // 身份发布阶段
  | 'start'           // 游戏开始阶段：角色放置
  | 'action1'         // 行动阶段1（杀手可以杀人）
  | 'move1'           // 移动阶段1
  | 'action2'         // 行动阶段2（杀手可以杀人）
  | 'move2'           // 移动阶段2
  | 'action3'         // 行动阶段3（杀手可以杀人）
  | 'move3'           // 移动阶段3
  | 'action4'         // 行动阶段4（杀手可以杀人）
  | 'move4'           // 移动阶段4
  | 'death_report'    // 死亡播报阶段：展示本轮死亡角色 + 封锁死亡地点
  | 'vote'            // 投票阶段
  | 'vote_result'     // 投票结果公示
  | 'end';            // 游戏结束

/** 身份类型 */
export type Identity = 'killer' | 'civilian';

/** 玩家状态 */
export type PlayerStatus = 'alive' | 'dying' | 'dead';

/** 阵营类型 */
export type Faction = 'good' | 'evil';

/** 胜利方 */
export type Winner = 'good' | 'evil' | null;

// ============================================
// 地点效果
// ============================================

export type LocationEffectType =
  | 'unblockable'          // 不会被封锁（中心公园）
  | 'crowded'              // 商业街人头攒动，平民无法看到人和尸体
  | 'mass_civilian_death'  // 有玩家死亡时该房间所有平民同时死亡（南翠屏公园）
  | 'shrine_vision'        // 行动阶段3后可查看地点人员记录（凌宇神社）
  | 'identity_transform'   // 平民死亡时身份变为杀手（疾控中心）
  | 'no_attack'            // 该地点内任何攻击技能无法使用
  | 'bridge_jump'          // 单向桥：可从该地点跳到指定目的地，但无法反向到达
  | 'asylum_extra_attack'  // 阿萨姆疯人院：杀手在此攻击不消耗常规攻击次数（额外获得一次攻击）
  | 'placeholder';         // 占位符（暂无效果）

export interface LocationEffect {
  type: LocationEffectType;
  name: string;        // 效果名称
  description: string; // 效果描述
  extraDestinations?: string[]; // 单向桥效果专用：可到达的额外地点名称列表
}

// ============================================
// 地点与地图
// ============================================

export interface Location {
  id: string;
  name: string;
  connectedTo: string[];
  isBlocked: boolean;
  x: number;
  y: number;
  effect?: LocationEffect; // 地点特殊效果
}

// ============================================
// 玩家
// ============================================

export interface Player {
  id: string;
  name: string;
  identity: Identity;
  status: PlayerStatus;
  locationId: string;
  isRevealed: boolean;   // 身份是否已暴露（死亡后自动暴露）
  votedFor: string | null;
  voteCount: number;
  heroId: string;        // 分配的英雄ID
  halted: boolean;       // 停步：拥有此效果的玩家会跳过下一个行动阶段
  teleportReady: boolean; // 传送：下次移动可到达任意地点
  doubleMoveActive: boolean;    // 疾行：激活后可移动两格
  doubleMoveFirstDone: boolean; // 疾行：是否已经完成了第一次移动

  // 杀手攻击次数计数器（每轮重置）
  normalAttackRemaining: number;  // 常规攻击剩余次数（非阿萨姆疯人院），每轮初始1
  asylumAttackRemaining: number;  // 阿萨姆疯人院攻击剩余次数，每轮初始1

  isBot?: boolean;  // 空壳玩家标记（联机调试模式：服务器按名字标记，前端据此区分真假玩家）
}

// ============================================
// 游戏事件
// ============================================

/** 待结算的攻击事件 */
export interface PendingAttack {
  attackerId: string;   // 攻击者
  targetId: string;     // 目标
  actionPhase: string;  // 哪个行动阶段发起的（action1/action2/action3）
}

export interface GameEvent {
  id: string;
  round: number;
  phase: GamePhase;
  timestamp: number;
  type: 'move' | 'death' | 'vote' | 'phase_change' | 'block' | 'info' | 'settlement' | 'win' | 'attack';
  description: string;
  playerId?: string;
  targetId?: string;
  locationId?: string;
}

// ============================================
// 游戏状态
// ============================================

export interface GameState {
  phase: GamePhase;
  round: number;
  players: Player[];
  locations: Location[];
  events: GameEvent[];
  blockedLocations: string[];
  isPlaying: boolean;
  winner: Winner;

  // 设置阶段数据
  killerCount: number;
  civilianCount: number;
  tempLocations: Location[]; // 编辑中的地图

  // 英雄池配置
  heroPoolEnabled: boolean;
  selectedHeroIds: string[];

  // 功夫技能追踪：当前行动阶段中激活了功夫的玩家ID列表
  kungFuActivePlayers: string[];

  // 待结算攻击队列（行动阶段记录，结算阶段统一处理）
  pendingAttacks: PendingAttack[];

  // 技能使用记录：playerId -> 已使用的技能ID列表
  usedSkills: Record<string, string[]>;

  // 地点经过记录：每轮结束后重置，locationId -> 经过该地点的玩家ID列表（按经过顺序）
  locationVisits: Record<string, string[]>;

  // 凌宇神社查看状态
  shrineVisionActive: boolean;       // 是否处于凌宇神社查看模式
  shrineVisionPlayerId: string | null; // 可以使用效果的玩家ID

  // 被切断的道路记录（张扬【断路】技能），用于地图上显示红×
  cutConnections: Array<{ locA: string; locB: string }>;

  // 白野【追踪】技能状态
  trackedPlayerId: string | null;   // 被追踪的玩家ID
  trackRecords: TrackRecord[];       // 追踪记录

  // 江枫【侦察无人机】技能状态
  droneLocationId: string | null;  // 无人机放置的地点ID
  dronePlayerId: string | null;    // 使用无人机的玩家ID
  droneRound: number;               // 放置的轮次


  // 每轮重置的技能使用计数（once_per_round 技能）：skillId -> usedCount
  roundSkillUsage: Record<string, number>;

  // 联机：我的玩家ID和身份（玩家端从房主私发获取）
  myPlayerId: string;
  myIdentity: Identity;
}

/** 追踪记录 */
export interface TrackRecord {
  round: number;
  phase: string;
  action: string;       // 操作描述
  locationId?: string;  // 经过的地点ID
}

// ============================================
// 辅助函数
// ============================================

export function getPhaseName(phase: GamePhase): string {
  const names: Record<string, string> = {
    setup: '游戏设置',
    identity: '身份发布',
    start: '游戏开始',
    action1: '行动阶段 ①',
    move1: '移动阶段',
    action2: '行动阶段 ②',
    move2: '移动阶段',
    action3: '行动阶段 ③',
    move3: '移动阶段',
    action4: '行动阶段 ④',
    move4: '移动阶段',
    death_report: '死亡播报',
    vote: '投票阶段',
    vote_result: '投票结果',
    end: '游戏结束',
  };
  return names[phase] || '未知阶段';
}

export function getPhaseDescription(phase: GamePhase): string {
  const descriptions: Record<string, string> = {
    setup: '配置玩家、身份数量和地图',
    identity: '查看并分配身份给各玩家',
    start: '将所有玩家放置到地图上',
    action1: '杀手选择目标发起攻击',
    move1: '存活玩家移动到相邻地点',
    action2: '杀手选择目标发起攻击',
    move2: '存活玩家移动到相邻地点',
    action3: '杀手选择目标发起攻击',
    move3: '存活玩家移动到相邻地点',
    action4: '杀手选择目标发起攻击',
    move4: '存活玩家移动到相邻地点',
    death_report: '展示本轮所有死亡角色',
    vote: '存活玩家投票淘汰',
    vote_result: '公示投票结果',
    end: '游戏已结束',
  };
  return descriptions[phase] || '';
}

export function getIdentityName(identity: Identity): string {
  return identity === 'killer' ? '杀手' : '平民';
}

export function getIdentityColor(identity: Identity): string {
  return identity === 'killer' ? '#dc2626' : '#2563eb';
}

export function getFactionName(identity: Identity): string {
  return identity === 'killer' ? '杀手阵营' : '好人阵营';
}

export function getPhaseActionHint(phase: GamePhase): string {
  switch (phase) {
    case 'setup':
      return '配置玩家、身份数量和地图布局';
    case 'identity':
      return '向每位玩家告知其身份';
    case 'start':
      return '将所有玩家放置到地图上的起始位置';
    case 'action1':
    case 'action2':
    case 'action3':
    case 'action4':
      return '选择目标发起攻击';
    case 'move1':
    case 'move2':
    case 'move3':
    case 'move4':
      return '选择一个相邻地点进行移动';
    case 'death_report':
      return '查看本轮死亡角色';
    case 'vote':
      return '选择投票目标，确认后票数最高者出局';
    case 'vote_result':
      return '查看投票结果';
    case 'end':
      return '游戏结束';
    default:
      return '';
  }
}
