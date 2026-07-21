// ============================================
// 英雄系统类型定义
// ============================================

/** 技能类型 */
export type SkillType = 'active' | 'passive' | 'investigate';

/** 技能目标类型 */
export type SkillTargetType = 'same_location_player' | 'any_player' | 'self' | 'none' | 'location_pair' | 'adjacent_location';

/** 技能使用限制 */
export type SkillLimit = 'once_per_game' | 'once_per_round' | 'unlimited';

/** 英雄技能 */
export interface HeroSkill {
  id: string;
  name: string;
  description: string;
  type: SkillType;
  targetType: SkillTargetType;
  limit: SkillLimit;
  usedCount: number;        // 已使用次数
  maxUses: number;          // 最大使用次数
  usablePhase: string[];    // 可在哪些阶段使用（如 ['action1','action2','action3']）
}

/** 英雄立绘资源（预留位置） */
export interface HeroAssets {
  // 头像 - 小尺寸，用于玩家卡片等位置
  // TODO: 添加头像图片路径
  // avatar: string;

  // 立绘 - 大尺寸，用于展示界面
  // TODO: 添加立绘图片路径
  // portrait: string;

  // 半身像 - 中等尺寸
  // TODO: 添加半身像图片路径
  // halfBody: string;
}

/** 英雄 */
export interface Hero {
  id: string;
  name: string;
  title: string;            // 称号/绰号
  description: string;      // 背景故事/描述
  color: string;            // 主题色
  speed: number;            // 速度数值（影响行动顺序等）
  assets: HeroAssets;       // 立绘和头像资源（预留）
  skills: HeroSkill[];      // 技能列表
}

/** 英雄池配置 */
export interface HeroPoolConfig {
  heroIds: string[];        // 参与本局游戏的英雄ID列表
  availableHeroes: Hero[];  // 所有可用英雄
}

/** 英雄使用记录（用于游戏内追踪） */
export interface HeroUsageRecord {
  playerId: string;
  heroId: string;
  skillUsages: {
    skillId: string;
    usedCount: number;
    usedInRounds: number[];
  }[];
}
