// ============================================
// 游戏核心类型定义 - 简化版
// ============================================

/** 游戏阶段 */
export type GamePhase =
  | 'setup'           // 设置阶段：配置玩家、身份、地图
  | 'identity'        // 身份发布阶段
  | 'start'           // 游戏开始阶段：角色放置
  | 'investigate1'    // 探查阶段1
  | 'action1'         // 行动阶段1（杀手可以杀人）
  | 'settlement1'     // 结算阶段1：处理action1的死亡 + 胜利判定
  | 'move1'           // 移动阶段1
  | 'investigate2'    // 探查阶段2
  | 'action2'         // 行动阶段2（杀手可以杀人）
  | 'settlement2'     // 结算阶段2：处理action2的死亡 + 胜利判定
  | 'move2'           // 移动阶段2
  | 'investigate3'    // 探查阶段3
  | 'action3'         // 行动阶段3（杀手可以杀人）
  | 'settlement3'     // 结算阶段3：处理action3的死亡 + 胜利判定
  | 'move4'           // 移动阶段4
  | 'investigate4'    // 探查阶段4
  | 'action4'         // 行动阶段4（杀手可以杀人）
  | 'settlement4'     // 结算阶段4：处理action4的死亡 + 胜利判定
  | 'shrine_vision'   // 凌宇神社查看阶段：选择地点查看经过人员
  | 'death_report'    // 死亡播报阶段：展示本轮死亡角色 + 封锁死亡地点
  | 'speak'           // 发言阶段
  | 'vote'            // 投票阶段
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
    investigate1: '探查阶段 ①',
    action1: '行动阶段 ①',
    settlement1: '结算阶段 ①',
    move1: '移动阶段 ②',
    investigate2: '探查阶段 ②',
    action2: '行动阶段 ②',
    settlement2: '结算阶段 ②',
    move2: '移动阶段 ③',
    move4: '移动阶段 ④',
    investigate3: '探查阶段 ③',
    action3: '行动阶段 ③',
    settlement3: '结算阶段 ③',
    investigate4: '探查阶段 ④',
    action4: '行动阶段 ④',
    settlement4: '结算阶段 ④',
    shrine_vision: '凌宇神社',
    death_report: '死亡播报',
    speak: '发言阶段',
    vote: '投票阶段',
    end: '游戏结束',
  };
  return names[phase] || '未知阶段';
}

export function getPhaseDescription(phase: GamePhase): string {
  const descriptions: Record<string, string> = {
    setup: '配置玩家、身份数量和地图',
    identity: '主持人查看并分配身份给各玩家',
    start: '主持人将所有玩家放置到地图上',
    investigate1: '告知各玩家其所在地点的其他玩家',
    action1: '杀手选择目标 → 攻击记录在案（结算阶段统一处理）',
    settlement1: '结算所有攻击：有功夫则反弹攻击者，无功夫则目标死亡',
    move1: '主持人操控所有存活玩家移动',
    investigate2: '告知各玩家其所在地点的其他玩家',
    action2: '杀手选择目标 → 攻击记录在案（结算阶段统一处理）',
    settlement2: '结算所有攻击：有功夫则反弹攻击者，无功夫则目标死亡',
    move2: '主持人操控所有存活玩家移动（最后一轮移动）',
    investigate3: '告知各玩家其所在地点的其他玩家',
    action3: '杀手选择目标 → 攻击记录在案（结算阶段统一处理）',
    settlement3: '结算所有攻击：有功夫则反弹攻击者，无功夫则目标死亡',
    move4: '主持人操控所有存活玩家移动（第四轮移动）',
    investigate4: '告知各玩家其所在地点的其他玩家',
    action4: '杀手选择目标 → 攻击记录在案（结算阶段统一处理）',
    settlement4: '结算所有攻击：有功夫则反弹攻击者，无功夫则目标死亡',
    shrine_vision: '凌宇神社中速度最高的人可选择一个地点，查看本轮经过该地点的人员名单',
    death_report: '展示本轮所有死亡角色，封锁死亡地点',
    speak: '存活玩家依次发言',
    vote: '主持人记录投票并标记出局玩家',
    end: '游戏已结束，显示胜利方',
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
      return '向每位玩家私下告知其身份，确认后进入下一步';
    case 'start':
      return '将所有玩家拖动放置到地图上的起始位置';
    case 'investigate1':
    case 'investigate2':
    case 'investigate3':
    case 'investigate4':
      return '告知每位玩家：其所在地点还有哪些玩家';
    case 'action1':
    case 'action2':
    case 'action3':
    case 'action4':
      return '选择目标发起攻击 → 攻击被记录在案，结算阶段统一处理伤害';
    case 'settlement1':
    case 'settlement2':
    case 'settlement3':
    case 'settlement4':
      return '统一结算所有攻击：有功夫则反弹攻击者，无功夫则目标死亡';
    case 'shrine_vision':
      return '选择地点查看本轮经过该地点的人员名单';
    case 'death_report':
      return '查看本轮死亡角色列表，死亡地点将被统一封锁';
    case 'move1':
    case 'move2':
    case 'move4':
      return '存活玩家依次移动（每人最多两步）';
    case 'speak':
      return '按顺序让存活玩家依次发言讨论';
    case 'vote':
      return '存活玩家投票 → 主持人选择得票最多的玩家标记出局（不封锁地点）';
    case 'end':
      return '游戏结束，展示胜利方';
    default:
      return '';
  }
}
