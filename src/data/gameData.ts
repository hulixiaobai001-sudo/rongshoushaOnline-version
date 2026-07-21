// ============================================
// 游戏辅助函数
// ============================================

import type { Player, Location, LocationEffect } from '@/types/game';

/** 获取地点名称 */
export function getLocationName(locations: Location[], locationId: string): string {
  const loc = locations.find((l) => l.id === locationId);
  return loc ? loc.name : '未知地点';
}

/** 获取某地点的存活玩家 */
export function getPlayersAtLocation(players: Player[], locationId: string): Player[] {
  return players.filter((p) => p.locationId === locationId && (p.status === 'alive' || p.status === 'dying'));
}

/** 获取某地点的所有玩家（含尸体） */
export function getAllPlayersAtLocation(players: Player[], locationId: string): Player[] {
  return players.filter((p) => p.locationId === locationId);
}

/** 获取相邻地点 */
export function getAdjacentLocations(locations: Location[], locationId: string): string[] {
  const loc = locations.find((l) => l.id === locationId);
  return loc ? loc.connectedTo : [];
}

/** 检查两点是否相邻 */
export function isAdjacent(locations: Location[], from: string, to: string): boolean {
  const loc = locations.find((l) => l.id === from);
  return loc ? loc.connectedTo.includes(to) : false;
}

/** 计算两点间最短距离（BFS） */
export function getDistance(locations: Location[], from: string, to: string): number {
  if (from === to) return 0;
  const locMap = new Map(locations.map((l) => [l.id, l]));
  const queue: [string, number][] = [[from, 0]];
  const visited = new Set<string>([from]);

  while (queue.length > 0) {
    const [current, dist] = queue.shift()!;
    const loc = locMap.get(current);
    if (!loc) continue;
    for (const neighbor of loc.connectedTo) {
      if (neighbor === to) return dist + 1;
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, dist + 1]);
      }
    }
  }
  return Infinity;
}

/** 获取可到达的地点（指定步数内） */
export function getReachableLocations(
  locations: Location[],
  from: string,
  maxSteps: number
): { id: string; name: string; steps: number }[] {
  const locMap = new Map(locations.map((l) => [l.id, l]));
  const result: { id: string; name: string; steps: number }[] = [];
  const queue: [string, number][] = [[from, 0]];
  const visited = new Set<string>([from]);

  while (queue.length > 0) {
    const [current, dist] = queue.shift()!;
    if (dist > 0 && dist <= maxSteps) {
      const loc = locMap.get(current);
      if (loc) result.push({ id: current, name: loc.name, steps: dist });
    }
    if (dist >= maxSteps) continue;

    const loc = locMap.get(current);
    if (!loc) continue;
    for (const neighbor of loc.connectedTo) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, dist + 1]);
      }
    }
  }
  return result;
}

/** 生成唯一ID */
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

// ============================================
// 英雄池1.1
// ============================================

/** 英雄池1.1 - 可用的英雄ID列表 */
export const HERO_POOL_V1_1_IDS = [
  'xiling',        // 西凌
  'niangao',       // 年糕
  'lilongxiang',   // 李龙祥
  'zhangyang',     // 张扬
  'fengming',      // 冯明
  'wangli',        // 王力
  'yeyu',          // 夜羽
  'yanzhuo',       // 言浊
  'tianyi',        // 天燚先生
  'baiye',         // 白野
  'zhuxun',        // 竹隼
  'jiangfeng',     // 江枫
];

// ============================================
// 地点效果定义
// ============================================

/** 地点效果预设 - 按地点名称匹配 */
export const LOCATION_EFFECTS: Record<string, LocationEffect> = {
  '阿萨姆疯人院': {
    type: 'asylum_extra_attack',
    name: '多刀',
    description: '杀手在此地点攻击不消耗常规攻击次数（额外获得一次攻击机会）',
  },
  '中心公园': {
    type: 'unblockable',
    name: '不会封锁',
    description: '中心公园永远不会被封锁',
  },
  '商业街': {
    type: 'crowded',
    name: '平民无视野',
    description: '平民无法看到周围的人和尸体，探查时显示"商业街人头攒动"',
  },
  '一大队': {
    type: 'no_attack',
    name: '禁武',
    description: '该地点内任何攻击技能无法使用',
  },
  '南翠屏公园': {
    type: 'mass_civilian_death',
    name: '连锁反应',
    description: '当有玩家在此处死亡，该房间内所有平民同时死亡（无伤害来源）',
  },
  '凌宇神社': {
    type: 'shrine_vision',
    name: '神视',
    description: '行动阶段3结束后，处于此房间且速度最高的人可选择一个地点，查看本轮所有经过该地点的人员名单',
  },
  '志成桥': {
    type: 'bridge_jump',
    name: '地铁站',
    description: '位于此处可以移动到商业街和阿萨姆疯人院（从商业街和阿萨姆疯人院无法直接到达志成桥）',
    extraDestinations: ['商业街', '阿萨姆疯人院'],
  },
  '疾控中心': {
    type: 'identity_transform',
    name: '变异',
    description: '在此处死亡的平民身份会转变为杀手',
  },
};

/** 根据地点名称获取效果 */
export function getLocationEffectByName(name: string): LocationEffect | undefined {
  return LOCATION_EFFECTS[name];
}

/** 地点是否有效果 */
export function hasLocationEffect(location: Location, effectType: string): boolean {
  return location.effect?.type === effectType;
}

/** 获取地点效果显示名 */
export function getEffectDisplayName(effect?: LocationEffect): string {
  if (!effect) return '';
  if (effect.type === 'placeholder') return '（暂无效果）';
  return effect.name;
}

// ============================================
// 随机地图生成
// ============================================

/** 地点名称随机池 */
export const LOCATION_NAME_POOL = [
  '南翠屏公园',
  '中心公园',
  '阿萨姆疯人院',
  '凌宇神社',
  '疾控中心',
  '志成桥',
  '一大队',
  '商业街',
];

/** 随机打乱数组（Fisher-Yates） */
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 使用随机池生成地图
 *  @param count 生成地点数量（默认8，不超过池子大小）
 *  @returns 生成的 Location 数组
 */
export function generateRandomMap(count: number = 8): Location[] {
  const names = shuffleArray(LOCATION_NAME_POOL).slice(0, Math.min(count, LOCATION_NAME_POOL.length));
  const locs: Location[] = names.map((name) => ({
    id: generateId('loc'),
    name,
    x: 10 + Math.random() * 80,  // 10~90 范围内随机
    y: 10 + Math.random() * 80,
    connectedTo: [],
    isBlocked: false,
  }));

  // 生成随机连通：确保每个节点至少有一个连接，形成连通图
  // 1. 先生成最小生成树（确保连通）
  const connected = new Set<number>([0]);
  const unconnected = new Set<number>(Array.from({ length: locs.length }, (_, i) => i).slice(1));

  while (unconnected.size > 0) {
    // 从已连接集合中选一个点
    const fromArr = Array.from(connected);
    const fromIdx = fromArr[Math.floor(Math.random() * fromArr.length)];
    // 从未连接集合中选一个点
    const toArr = Array.from(unconnected);
    const toIdx = toArr[Math.floor(Math.random() * toArr.length)];

    // 建立连接
    locs[fromIdx].connectedTo.push(locs[toIdx].id);
    locs[toIdx].connectedTo.push(locs[fromIdx].id);

    connected.add(toIdx);
    unconnected.delete(toIdx);
  }

  // 2. 随机添加一些额外的边（让图更有意思，最多加 count/2 条）
  const extraEdges = Math.floor(count / 2);
  for (let i = 0; i < extraEdges; i++) {
    const a = Math.floor(Math.random() * locs.length);
    const b = Math.floor(Math.random() * locs.length);
    if (a !== b && !locs[a].connectedTo.includes(locs[b].id)) {
      locs[a].connectedTo.push(locs[b].id);
      locs[b].connectedTo.push(locs[a].id);
    }
  }

  // 为每个地点绑定效果
  locs.forEach((loc) => {
    loc.effect = getLocationEffectByName(loc.name);
  });

  return locs;
}
