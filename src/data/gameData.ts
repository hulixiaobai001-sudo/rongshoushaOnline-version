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

  // 志成桥效果：extraDestinations 作为单向可达（封锁的地点不可达）
  const fromLoc = locMap.get(from);
  if (fromLoc?.effect?.type === 'bridge_jump' && fromLoc.effect.extraDestinations) {
    fromLoc.effect.extraDestinations.forEach((name) => {
      const target = locations.find(l => l.name === name);
      if (target && !target.isBlocked && !visited.has(target.id)) {
        visited.add(target.id);
        result.push({ id: target.id, name: target.name, steps: 1 });
      }
    });
  }

  while (queue.length > 0) {
    const [current, dist] = queue.shift()!;
    const loc = locMap.get(current);
    if (!loc) continue;
    if (dist > 0 && dist <= maxSteps) {
      // 封锁地点不可达
      if (!loc.isBlocked) result.push({ id: current, name: loc.name, steps: dist });
    }
    if (dist >= maxSteps) continue;
    // 封锁地点不能作为中转站（不能穿过封锁地点到达更远处）
    if (loc.isBlocked) continue;
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
  'xiling',        // 斯派洛（带刀好人）
  'niangao',       // 杰克.死眼（功夫）
  'lilongxiang',   // 科利.清道夫（枪毙）
  'zhangyang',     // 麦克.锐耳（断路）
  'yeyu',          // 银行经理（潜伏）
  'baiye',         // 玛丽（追踪香囊）
  'tianyi',        // 麟破仑.熔金（识破）
  'zhuxun',        // 罗宾（疾行）
];

// ============================================
// 地点效果定义
// ============================================

/** 地点效果预设 - 按地点名称匹配 */
export const LOCATION_EFFECTS: Record<string, LocationEffect> = {
  '死人沼泽': {
    type: 'asylum_extra_attack',
    name: '多刀',
    description: '杀手在此地点攻击不消耗常规攻击次数（额外获得一次攻击机会）',
  },
  '死寂荒漠': {
    type: 'unblockable',
    name: '不会封锁',
    description: '死寂荒漠永远不会被封锁',
  },
  '甘露之地': {
    type: 'crowded',
    name: '平民无视野',
    description: '平民无法看到周围的人和尸体，探查时显示"甘露之地人头攒动"',
  },
  '曼城': {
    type: 'no_attack',
    name: '禁武',
    description: '该地点内任何攻击技能无法使用',
  },
  '曼斯顿边境': {
    type: 'mass_civilian_death',
    name: '连锁反应',
    description: '当有玩家在此处死亡，该房间内所有平民同时死亡（无伤害来源）',
  },
  '双阳': {
    type: 'shrine_vision',
    name: '神视',
    description: '行动阶段3结束后，处于此房间且速度最高的人可选择一个地点，查看本轮所有经过该地点的人员名单',
  },
  '死人湾': {
    type: 'bridge_jump',
    name: '单向通行',
    description: '位于此处可以移动到甘露之地和死人沼泽（从甘露之地和死人沼泽无法直接到达死人湾）',
    extraDestinations: ['甘露之地', '死人沼泽'],
  },
  '西部荒野': {
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
  '双阳',
  '甘露之地',
  '曼斯顿边境',
  '死寂荒漠',
  '兰得群峰',
  '死人湾',
  '西部荒野',
  '死人沼泽',
  '南部油田',
  '曼城',
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
