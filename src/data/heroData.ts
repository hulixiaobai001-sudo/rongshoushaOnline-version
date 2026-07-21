// ============================================
// 英雄数据
// ============================================

import type { Hero } from '@/types/hero';

/** 英雄池 - 所有可用英雄 */
export const HERO_POOL: Hero[] = [
  // ═══════════════════════════════════════════
  // 西凌
  // ═══════════════════════════════════════════
  {
    id: 'xiling',
    name: '西凌',
    title: '黑道老大',
    description: '迷宫三刃之一，战力超群的杀手，和警察局有着说不清道不明的恋爱纠葛。',
    color: '#7c3aed', // 紫色
    speed: 100,
    assets: {
      // TODO: 添加头像图片
      // avatar: '/assets/heroes/xiling/avatar.png',
      // TODO: 添加立绘图片
      // portrait: '/assets/heroes/xiling/portrait.png',
      // TODO: 添加半身像图片
      // halfBody: '/assets/heroes/xiling/half.png',
    },
    skills: [
      {
        id: 'xiling_kill_same_room',
        name: '影杀',
        description: '杀死与你处在同一房间的一名玩家。每局游戏限用一次。',
        type: 'active',
        targetType: 'same_location_player',
        limit: 'once_per_game',
        usedCount: 0,
        maxUses: 1,
        usablePhase: ['action1', 'action2', 'action3', 'action4'],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 科雄
  // ═══════════════════════════════════════════
  {
    id: 'kexiong',
    name: '科雄',
    title: '邪教头子',
    description: '邪教徒，内测特供角色。被你发现了？',
    color: '#0d9488', // 青色
    speed: 1,
    assets: {
      // TODO: 添加头像图片
      // avatar: '/assets/heroes/kexiong/avatar.png',
      // TODO: 添加立绘图片
      // portrait: '/assets/heroes/kexiong/portrait.png',
      // TODO: 添加半身像图片
      // halfBody: '/assets/heroes/kexiong/half.png',
    },
    skills: [
      {
        id: 'kexiong_investigate',
        name: '洞察',
        description: '查验任意一名玩家的真实身份。每局游戏限用一次。',
        type: 'investigate',
        targetType: 'any_player',
        limit: 'once_per_game',
        usedCount: 0,
        maxUses: 1,
        usablePhase: ['action1', 'action2', 'action3', 'action4'],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 年糕
  // ═══════════════════════════════════════════
  {
    id: 'niangao',
    name: '年糕',
    title: '功夫熊猫',
    description: '特警一大堆的厨师，武功很高的熊猫。',
    color: '#d97706', // 琥珀色
    speed: 0,
    assets: {
      // TODO: 添加头像图片
      // avatar: '/assets/heroes/niangao/avatar.png',
      // TODO: 添加立绘图片
      // portrait: '/assets/heroes/niangao/portrait.png',
      // TODO: 添加半身像图片
      // halfBody: '/assets/heroes/niangao/half.png',
    },
    skills: [
      {
        id: 'niangao_kungfu',
        name: '功夫',
        description: '在行动阶段使用，给自己加持功夫状态。本行动阶段内若有同房间玩家攻击你，你无效化该伤害并将其反杀。每局游戏限用一次。',
        type: 'passive',
        targetType: 'self',
        limit: 'once_per_game',
        usedCount: 0,
        maxUses: 1,
        usablePhase: ['action1', 'action2', 'action3', 'action4'],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 李龙祥
  // ═══════════════════════════════════════════
  {
    id: 'lilongxiang',
    name: '李龙祥',
    title: '特警一大队队长',
    description: '一位铁面无私的警长，坚信以暴制暴是维护正义的最后手段。当他举起狂暴蒸汽时，没有人知道他是否真的能承受审判的重量。',
    color: '#dc2626', // 红色
    speed: 2,
    assets: {
      // TODO: 添加头像图片
      // avatar: '/assets/heroes/lilongxiang/avatar.png',
      // TODO: 添加立绘图片
      // portrait: '/assets/heroes/lilongxiang/portrait.png',
      // TODO: 添加半身像图片
      // halfBody: '/assets/heroes/lilongxiang/half.png',
    },
    skills: [
      {
        id: 'lilongxiang_gunshot',
        name: '枪毙',
        description: '在投票阶段，选择一名玩家令其淘汰并公布身份。若该玩家为好人（平民），则李龙祥也会死亡。每局游戏限用一次。',
        type: 'active',
        targetType: 'any_player',
        limit: 'once_per_game',
        usedCount: 0,
        maxUses: 1,
        usablePhase: ['vote'],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 竹隼
  // ═══════════════════════════════════════════
  {
    id: 'zhuxun',
    name: '竹隼',
    title: '人造人杀手',
    description: '迷宫三刃之一，人造人杀手，很爱弟弟。',
    color: '#10b981', // 翡翠绿
    speed: 10,
    assets: {
      // TODO: 添加头像图片
      // avatar: '/assets/heroes/zhuxun/avatar.png',
      // TODO: 添加立绘图片
      // portrait: '/assets/heroes/zhuxun/portrait.png',
      // TODO: 添加半身像图片
      // halfBody: '/assets/heroes/zhuxun/half.png',
    },
    skills: [
      {
        id: 'zhuxun_double_move',
        name: '疾行',
        description: '在移动阶段使用，激活后本次移动阶段可连续移动两次（每次移动到相邻地点）。每轮限用一次。',
        type: 'active',
        targetType: 'self',
        limit: 'once_per_round',
        usedCount: 0,
        maxUses: 1,
        usablePhase: ['move1', 'move2', 'move4'],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 张扬
  // ═══════════════════════════════════════════
  {
    id: 'zhangyang',
    name: '张扬',
    title: '特警一大队副队长',
    description: '李龙祥家的奶牛猫，众所周知黑白配色的动物都不正常。',
    color: '#0891b2', // 青色
    speed: 10,
    assets: {
      // TODO: 添加头像图片
      // avatar: '/assets/heroes/zhangyang/avatar.png',
      // TODO: 添加立绘图片
      // portrait: '/assets/heroes/zhangyang/portrait.png',
      // TODO: 添加半身像图片
      // halfBody: '/assets/heroes/zhangyang/half.png',
    },
    skills: [
      {
        id: 'zhangyang_cut_connection',
        name: '断路',
        description: '在行动阶段，选择两个地点切断它们之间的道路。若两地无道路相连则无效果。每局游戏限用一次。',
        type: 'active',
        targetType: 'location_pair',
        limit: 'once_per_game',
        usedCount: 0,
        maxUses: 1,
        usablePhase: ['action1', 'action2', 'action3', 'action4'],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 冯明
  // ═══════════════════════════════════════════
  {
    id: 'fengming',
    name: '冯明',
    title: '法医',
    description: '身世神秘的法医，疑似有传送能力。',
    color: '#2563eb',
    speed: 10,
    assets: {
      // TODO: 添加头像图片
      // avatar: '/assets/heroes/fengming/avatar.png',
      // TODO: 添加立绘图片
      // portrait: '/assets/heroes/fengming/portrait.png',
      // TODO: 添加半身像图片
      // halfBody: '/assets/heroes/fengming/half.png',
    },
    skills: [
      {
        id: 'fengming_teleport',
        name: '传送',
        description: '在移动阶段使用，激活后下次移动时可到达任意地点（不限于相邻地点）。每局游戏限用一次。',
        type: 'active',
        targetType: 'self',
        limit: 'once_per_game',
        usedCount: 0,
        maxUses: 1,
        usablePhase: ['move1', 'move2', 'move4'],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 王力
  // ═══════════════════════════════════════════
  {
    id: 'wangli',
    name: '王力',
    title: '特警一大队班长',
    description: '西凌的爱人，劲特大。',
    color: '#16a34a',
    speed: 10,
    assets: {
      // TODO: 添加头像图片
      // avatar: '/assets/heroes/wangli/avatar.png',
      // TODO: 添加立绘图片
      // portrait: '/assets/heroes/wangli/portrait.png',
      // TODO: 添加半身像图片
      // halfBody: '/assets/heroes/wangli/half.png',
    },
    skills: [
      {
        id: 'wangli_big_shot',
        name: '大力射门',
        description: '选择一个相邻地点，让处于该地点内的所有玩家在下个移动阶段无法行动。该效果无法跨大轮次生效。每局游戏限用一次。',
        type: 'active',
        targetType: 'adjacent_location',
        limit: 'once_per_game',
        usedCount: 0,
        maxUses: 1,
        usablePhase: ['action1', 'action2', 'action3', 'action4'],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 夜羽
  // ═══════════════════════════════════════════
  {
    id: 'yeyu',
    name: '夜羽',
    title: '间谍史莱姆',
    description: '迷宫三刃之一，大馋史莱姆。',
    color: '#374151',
    speed: 10,
    assets: {
      // TODO: 添加头像图片
      // avatar: '/assets/heroes/yeyu/avatar.png',
      // TODO: 添加立绘图片
      // portrait: '/assets/heroes/yeyu/portrait.png',
      // TODO: 添加半身像图片
      // halfBody: '/assets/heroes/yeyu/half.png',
    },
    skills: [
      {
        id: 'yeyu_stealth',
        name: '潜伏',
        description: '让自己进入潜伏状态，在下个移动阶段无法行动。该效果无法跨大轮次生效。每局游戏限用一次。',
        type: 'active',
        targetType: 'self',
        limit: 'once_per_game',
        usedCount: 0,
        maxUses: 1,
        usablePhase: ['action1', 'action2', 'action3', 'action4'],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 白野
  // ═══════════════════════════════════════════
  {
    id: 'baiye',
    name: '白野',
    title: '调香师',
    description: '凌宇神社的调香师，天真活泼调皮可爱还有点笨笨的。',
    color: '#1e293b', // 黑色（深色，保证可读性）
    speed: 120,
    assets: {
      // TODO: 添加头像图片
      // avatar: '/assets/heroes/baiye/avatar.png',
      // TODO: 添加立绘图片
      // portrait: '/assets/heroes/baiye/portrait.png',
      // TODO: 添加半身像图片
      // halfBody: '/assets/heroes/baiye/half.png',
    },
    skills: [
      {
        id: 'baiye_track',
        name: '追踪香囊',
        description: '在行动阶段，标记一个同地点的玩家。获取他从本回合行动阶段之后的所有操作记录和经过的地点，直到本轮结束。每局游戏限用一次。',
        type: 'active',
        targetType: 'same_location_player',
        limit: 'once_per_game',
        usedCount: 0,
        maxUses: 1,
        usablePhase: ['action1', 'action2', 'action3', 'action4'],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 天燚先生
  // ═══════════════════════════════════════════
  {
    id: 'tianyi',
    name: '天燚先生',
    title: '市长秘书',
    description: '一位深藏不露的智者，据说他的双眼能看穿一切伪装，只要与你同处一室，你的身份便无所遁形。',
    color: '#06b6d4', // 青色
    speed: 10,
    assets: {
      // TODO: 添加头像图片
      // avatar: '/assets/heroes/tianyi/avatar.png',
      // TODO: 添加立绘图片
      // portrait: '/assets/heroes/tianyi/portrait.png',
      // TODO: 添加半身像图片
      // halfBody: '/assets/heroes/tianyi/half.png',
    },
    skills: [
      {
        id: 'tianyi_investigate_same_room',
        name: '识破',
        description: '查验与你处在同一地点的一名玩家的身份。每局游戏限用一次。',
        type: 'investigate',
        targetType: 'same_location_player',
        limit: 'once_per_game',
        usedCount: 0,
        maxUses: 1,
        usablePhase: ['action1', 'action2', 'action3', 'action4'],
      },
    ],
  },

  // ═══════════════════════════════════════════
  // 言浊
  // ═══════════════════════════════════════════
  {
    id: 'yanzhuo',
    name: '言浊',
    title: '信息科警员',
    description: '竹隼的天才弟弟，不会打架。',
    color: '#ea580c',
    speed: 10,
    assets: {
      // TODO: 添加头像图片
      // avatar: '/assets/heroes/yanzhuo/avatar.png',
      // TODO: 添加立绘图片
      // portrait: '/assets/heroes/yanzhuo/portrait.png',
      // TODO: 添加半身像图片
      // halfBody: '/assets/heroes/yanzhuo/half.png',
    },
    skills: [
      {
        id: 'yanzhuo_suplex',
        name: '过肩摔',
        description: '选择同地点的一名角色，让其下个移动阶段无法行动。该效果无法跨大轮次生效。每局游戏限用一次。',
        type: 'active',
        targetType: 'same_location_player',
        limit: 'once_per_game',
        usedCount: 0,
        maxUses: 1,
        usablePhase: ['action1', 'action2', 'action3', 'action4'],
      },
    ],
  },

  
  // ═══════════════════════════════════════════
  // 江枫
  // ═══════════════════════════════════════════
  {
    id: 'jiangfeng',
    name: '江枫',
    title: '黑客',
    description: '绒兽大学的大学生，喜欢玩无人机。',
    color: '#06b6d4', // 青色
    speed: 30,
    assets: {},
    skills: [
      {
        id: 'jiangfeng_drone',
        name: '侦察无人机',
        description: '在当前地点放置一个无人机，记录本轮所有经过该地点的人员名单。每局游戏限用一次。',
        type: 'active',
        targetType: 'self',
        limit: 'once_per_game',
        usedCount: 0,
        maxUses: 1,
        usablePhase: ['action1', 'action2', 'action3'],
      },
    ],
  },
  // ═══════════════════════════════════════════
  // TODO: 在此添加更多英雄
  // ═══════════════════════════════════════════
];

// ============================================
// 辅助函数
// ============================================

/** 根据ID获取英雄 */
export function getHeroById(id: string): Hero | undefined {
  return HERO_POOL.find((h) => h.id === id);
}

/** 获取英雄主题色 */
export function getHeroColor(id: string): string {
  const hero = getHeroById(id);
  return hero ? hero.color : '#6b7280';
}

/** 获取英雄名称 */
export function getHeroName(id: string): string {
  const hero = getHeroById(id);
  return hero ? hero.name : '未知英雄';
}

/** 获取英雄称号 */
export function getHeroTitle(id: string): string {
  const hero = getHeroById(id);
  return hero ? hero.title : '';
}

/** 获取英雄技能列表 */
export function getHeroSkills(id: string) {
  const hero = getHeroById(id);
  return hero ? hero.skills : [];
}

/** 获取技能类型显示名 */
export function getSkillTypeName(type: string): string {
  const names: Record<string, string> = {
    active: '主动',
    passive: '被动',
    investigate: '侦查',
  };
  return names[type] || type;
}

/** 获取技能限制显示名 */
export function getSkillLimitName(limit: string): string {
  const names: Record<string, string> = {
    once_per_game: '每局1次',
    once_per_round: '每轮1次',
    unlimited: '无限',
  };
  return names[limit] || limit;
}

/** 获取英雄速度 */
export function getHeroSpeed(id: string): number {
  const hero = getHeroById(id);
  return hero ? hero.speed : 0;
}
