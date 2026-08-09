// ============================================
// 绒兽杀 · 服务器游戏引擎（服务器权威）
// 纯逻辑，无UI依赖，前后端共用规则
// ============================================

// ---------- 英雄池（8个可用） ----------
const HERO_POOL = ['xiling', 'niangao', 'lilongxiang', 'zhangyang', 'yeyu', 'baiye', 'tianyi', 'zhuxun'];

// ---------- 地图（10地点） ----------
const DEFAULT_MAP = [
  { id: 'loc_siji', name: '死寂荒漠', connectedTo: ['loc_ganlu', 'loc_mansidun', 'loc_lande', 'loc_sirenwan', 'loc_xibu', 'loc_sirenzhao'], x: 50, y: 45 },
  { id: 'loc_sirenzhao', name: '死人沼泽', connectedTo: ['loc_siji', 'loc_nanyou'], x: 50, y: 12 },
  { id: 'loc_ganlu', name: '甘露之地', connectedTo: ['loc_shuangyang', 'loc_mansidun', 'loc_siji'], x: 28, y: 25 },
  { id: 'loc_mansidun', name: '曼斯顿边境', connectedTo: ['loc_shuangyang', 'loc_ganlu', 'loc_siji'], x: 72, y: 22 },
  { id: 'loc_shuangyang', name: '双阳', connectedTo: ['loc_ganlu', 'loc_mansidun'], x: 12, y: 50 },
  { id: 'loc_lande', name: '兰得群峰', connectedTo: ['loc_siji', 'loc_sirenwan'], x: 85, y: 45 },
  { id: 'loc_sirenwan', name: '死人湾', connectedTo: ['loc_siji', 'loc_lande', 'loc_xibu'], x: 62, y: 70 },
  { id: 'loc_xibu', name: '西部荒野', connectedTo: ['loc_siji', 'loc_sirenwan', 'loc_nanyou', 'loc_mancheng'], x: 38, y: 78 },
  { id: 'loc_nanyou', name: '南部油田', connectedTo: ['loc_sirenzhao', 'loc_xibu', 'loc_mancheng'], x: 15, y: 80 },
  { id: 'loc_mancheng', name: '曼城', connectedTo: ['loc_xibu', 'loc_nanyou'], x: 78, y: 82 },
];

// 地点效果
const LOCATION_EFFECTS = {
  '死人沼泽': 'asylum_extra_attack',
  '死寂荒漠': 'unblockable',
  '甘露之地': 'crowded',
  '曼城': 'no_attack',
  '曼斯顿边境': 'mass_civilian_death',
  '双阳': 'shrine_vision',
  '死人湾': 'bridge_jump',
  '西部荒野': 'identity_transform',
};
const BRIDGE_DESTS = ['甘露之地', '死人沼泽']; // 死人湾单向可达

// ---------- 阶段 ----------
const PHASE_ORDER = [
  'setup', 'identity', 'start',
  'action1', 'move1', 'action2', 'move2', 'action3', 'move3', 'action4', 'move4',
  'death_report', 'vote', 'vote_result',
];

const PHASE_NAMES = {
  setup: '设置', identity: '身份', start: '放置',
  action1: '行动①', move1: '移动', action2: '行动②', move2: '移动',
  action3: '行动③', move3: '移动', action4: '行动④', move4: '移动',
  death_report: '死亡播报', vote: '投票', vote_result: '投票结果',
};

// ---------- 工具 ----------
function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 死人沼泽·多刀：存活的杀手只要身处死人沼泽且没有额外攻击次数，就补 1 刀
// （覆盖移动进入/出生/投票重排/随机放置所有场景，避免"没刀就没刀了"）
function grantAsylumIfInMarsh(game) {
  const marsh = game.locations.find(l => l.effect?.type === 'asylum_extra_attack');
  if (!marsh) return;
  game.players.forEach(p => {
    if (p.identity === 'killer' && p.status === 'alive' && p.locationId === marsh.id && p.asylumAttackRemaining < 1) {
      p.asylumAttackRemaining = 1;
    }
  });
}

// ---------- 创建游戏 ----------
function createGame({ hostName, players: names, killerCount, botNames = [] }) {
  const total = names.length;
  const targetKillers = killerCount > 0 ? Math.min(killerCount, Math.max(1, Math.floor(total / 4))) : Math.max(1, Math.floor(total / 4));

  // 玩家（isBot 标记空壳，botNames 由调用方传入）
  const players = names.map((n, i) => ({
    id: genId('p'), name: n, identity: '', status: 'alive',
    locationId: '', isRevealed: false, heroId: '',
    halted: false, teleportReady: false, doubleMoveActive: false, doubleMoveFirstDone: false,
    normalAttackRemaining: 1, asylumAttackRemaining: 0,
    votedFor: null, voteCount: 0,
    isBot: botNames.includes(n),
  }));

  // 身份分配（完全随机）
  const ids = [];
  for (let i = 0; i < targetKillers; i++) ids.push('killer');
  for (let i = 0; i < total - targetKillers; i++) ids.push('civilian');
  shuffle(ids).forEach((id, i) => { players[i].identity = id; });

  // 英雄分配（不重复）
  const pool = shuffle(HERO_POOL);
  players.forEach((p, i) => { if (i < pool.length) p.heroId = pool[i]; });

  // 地图
  const locations = DEFAULT_MAP.map(l => {
    const effect = LOCATION_EFFECTS[l.name] ? { type: LOCATION_EFFECTS[l.name], name: l.name } : null;
    // 死人湾·单向桥：附带单向可达目的地（前端可达性/本地校验依赖 extraDestinations）
    if (effect?.type === 'bridge_jump') effect.extraDestinations = [...BRIDGE_DESTS];
    return { ...l, isBlocked: false, effect };
  });

  // 随机放置
  players.forEach(p => {
    p.locationId = locations[Math.floor(Math.random() * locations.length)].id;
  });

  const game = {
    phase: 'action1', round: 1, winner: null,
    players, locations,
    blockedLocations: [], cutConnections: [],
    kungFuActivePlayers: [], pendingAttacks: [],
    usedSkills: {}, roundSkillUsage: {},
    locationVisits: {},
    trackedPlayerId: null, trackRecords: [],
    trackerPlayerId: null, // 玛丽追踪者（追踪报告仅对其本人可见）
    droneLocationId: null, dronePlayerId: null, droneRound: 0,
    events: [],
  };
  // 出生在死人沼泽的杀手：直接补额外攻击次数（movePlayer 只在移动进入时触发）
  grantAsylumIfInMarsh(game);
  return game;
}

// ---------- 序列化（玩家视角，隐藏身份） ----------
function serializeGame(game, viewerId) {
  return {
    phase: game.phase, round: game.round, winner: game.winner,
    players: game.players.map(p => ({
      id: p.id, name: p.name, status: p.status, locationId: p.locationId,
      heroId: p.heroId, halted: p.halted, teleportReady: p.teleportReady,
      doubleMoveActive: p.doubleMoveActive, doubleMoveFirstDone: p.doubleMoveFirstDone,
      isRevealed: p.isRevealed, votedFor: p.votedFor,
      isBot: !!p.isBot, // 空壳标记：前端据此区分真假玩家
      normalAttackRemaining: p.normalAttackRemaining, asylumAttackRemaining: p.asylumAttackRemaining,
      // 身份：只给本人或已暴露（死亡/枪毙）；对局结束后（end/winner）全体公开用于结算展示
      identity: (p.id === viewerId || p.isRevealed || game.phase === 'end' || game.winner) ? p.identity : undefined,
    })),
    locations: game.locations.map(l => ({ ...l })),
    blockedLocations: game.blockedLocations,
    cutConnections: game.cutConnections,
    kungFuActivePlayers: game.kungFuActivePlayers,
    pendingAttacks: game.pendingAttacks,
    usedSkills: game.usedSkills,
    roundSkillUsage: game.roundSkillUsage,
    locationVisits: game.locationVisits,
    // 追踪信息：仅追踪者本人可见（防其他玩家窥探玛丽的目标和操作记录）
    trackedPlayerId: game.trackerPlayerId === viewerId ? game.trackedPlayerId : null,
    trackRecords: game.trackerPlayerId === viewerId ? game.trackRecords : [],
    droneLocationId: game.droneLocationId,
    dronePlayerId: game.dronePlayerId,
    droneRound: game.droneRound,
    // 事件：补 description 字段（前端事件日志用 description 渲染）
    events: game.events.slice(-20).map(e => ({ ...e, description: e.text })),
  };
}

// ---------- 阶段推进 ----------
function nextPhase(game) {
  if (game.phase === 'end') return;

  if (game.phase === 'vote') {
    handleVoteEnd(game);
    return;
  }

  if (game.phase === 'vote_result') {
    if (checkEnd(game)) return;
    game.round++;
    game.roundSkillUsage = {};
    game.blockedLocations = [];
    game.locations.forEach(l => { l.isBlocked = false; });
    game.kungFuActivePlayers = [];
    game.players.forEach(p => {
      if (p.halted) p.halted = false;
      if (p.doubleMoveActive) { p.doubleMoveActive = false; p.doubleMoveFirstDone = false; }
      if (!p.locationId) {
        const av = game.locations.filter(l => !l.isBlocked);
        if (av.length) p.locationId = av[Math.floor(Math.random() * av.length)].id;
      }
    });
    // 随机放置/重排后：身处死人沼泽的杀手补额外攻击次数
    grantAsylumIfInMarsh(game);
    game.phase = 'action1';
    addEvent(game, `进入第${game.round}轮，行动阶段①`);
    return;
  }

  const idx = PHASE_ORDER.indexOf(game.phase);
  if (idx >= 0 && idx < PHASE_ORDER.length - 1) {
    const next = PHASE_ORDER[idx + 1];
    // 离开移动阶段清停步/疾行
    if (game.phase.startsWith('move')) {
      game.players.forEach(p => {
        if (p.halted) p.halted = false;
        if (p.doubleMoveActive) { p.doubleMoveActive = false; p.doubleMoveFirstDone = false; }
      });
    }
    // 进入行动清功夫
    if (next.startsWith('action')) game.kungFuActivePlayers = [];
    game.phase = next;
    addEvent(game, `进入${PHASE_NAMES[next] || next}`);
  }
}

// ---------- 移动 ----------
function movePlayer(game, playerId, locationId) {
  const p = game.players.find(x => x.id === playerId);
  if (!p || p.status !== 'alive') return { ok: false, msg: '无效玩家' };
  // 服务器权威：只有移动阶段可以移动（前端按钮已限制，这里防越权/误发）
  if (!game.phase.startsWith('move')) return { ok: false, msg: '当前阶段无法移动' };
  if (p.halted && game.phase.startsWith('move')) return { ok: false, msg: '你处于停步状态' };
  const to = game.locations.find(l => l.id === locationId);
  const from = game.locations.find(l => l.id === p.locationId);
  if (!to) return { ok: false, msg: '目标不存在' };
  if (to.isBlocked) return { ok: false, msg: `${to.name} 已封锁` };

  // 死人湾单向
  if (from?.effect?.type === 'bridge_jump') {
    const canGo = from.name === '死人湾' ? BRIDGE_DESTS : [];
    if (!canGo.includes(to.name) && !from.connectedTo.includes(locationId)) {
      return { ok: false, msg: '【死人湾·单向】此路不通' };
    }
  } else if (!from?.connectedTo.includes(locationId)) {
    return { ok: false, msg: `无法到达 ${to.name}` };
  }

  p.locationId = locationId;
  // 经过记录
  if (!game.locationVisits[locationId]) game.locationVisits[locationId] = [];
  if (!game.locationVisits[locationId].includes(playerId)) game.locationVisits[locationId].push(playerId);
  // 追踪
  if (game.trackedPlayerId === playerId) {
    game.trackRecords.push({ round: game.round, phase: game.phase, action: '移动', locationId });
  }
  // 死人沼泽：杀手进入获得额外攻击（每轮1次）
  if (to.effect?.type === 'asylum_extra_attack' && p.identity === 'killer' && p.asylumAttackRemaining < 1) {
    p.asylumAttackRemaining = 1;
  }
  // 传送一次性
  if (p.teleportReady) p.teleportReady = false;
  // 疾行
  if (p.doubleMoveActive) {
    if (!p.doubleMoveFirstDone) p.doubleMoveFirstDone = true;
    else { p.doubleMoveActive = false; p.doubleMoveFirstDone = false; }
  }
  return { ok: true };
}

// ---------- 攻击（刀人） ----------
function attackPlayer(game, attackerId, targetId) {
  const atk = game.players.find(x => x.id === attackerId);
  const tgt = game.players.find(x => x.id === targetId);
  if (!atk || !tgt || atk.status !== 'alive' || tgt.status !== 'alive') return { ok: false, msg: '无效目标' };
  if (atk.identity !== 'killer') return { ok: false, msg: '仅杀手可攻击' };
  // 服务器权威：只有行动阶段可以攻击
  if (!game.phase.startsWith('action')) return { ok: false, msg: '仅行动阶段可攻击' };
  if (atk.locationId !== tgt.locationId) return { ok: false, msg: '目标不在同一地点' };

  const atkLoc = game.locations.find(l => l.id === atk.locationId);
  if (atkLoc?.effect?.type === 'no_attack') return { ok: false, msg: '【曼城·禁武】此地点禁止攻击' };

  // 次数检查（死人沼泽·多刀：额外攻击用完后仍可消耗常规攻击次数，共可刀2次）
  const inAsylum = atkLoc?.effect?.type === 'asylum_extra_attack';
  if (inAsylum) {
    if (atk.asylumAttackRemaining > 0) {
      atk.asylumAttackRemaining--;
    } else if (atk.normalAttackRemaining > 0) {
      atk.normalAttackRemaining--;
    } else {
      return { ok: false, msg: '本轮已攻击过' };
    }
  } else {
    if (atk.normalAttackRemaining <= 0) return { ok: false, msg: '本轮已攻击过' };
    atk.normalAttackRemaining--;
  }

  killPlayer(game, tgt.id, atk.id);
  return { ok: true };
}

// 西部荒野·变异：在西部荒野死亡且为平民 → 死而复生变成杀手
// （覆盖所有死亡路径：被刀/枪毙/投票出局）
function tryTransform(game, player) {
  if ((player.status !== 'dead' && player.status !== 'dying') || player.identity !== 'civilian') return false;
  const loc = game.locations.find(l => l.id === player.locationId);
  if (loc?.effect?.type !== 'identity_transform') return false;
  player.status = 'alive';
  player.identity = 'killer';
  player.isRevealed = false;
  addEvent(game, `【西部荒野·变异】${player.name} 死而复生！身份从平民转变为杀手！`);
  return true;
}

// 延迟死亡结算：所有人准备推进时，濒死(dying)玩家成为尸体
// （西部荒野平民则复活变异成杀手，不死亡）
function settleDeaths(game) {
  game.players.filter(p => p.status === 'dying').forEach(p => {
    if (tryTransform(game, p)) return; // 变异复活
    p.status = 'dead';
    p.isRevealed = true;
    addEvent(game, `${p.name} 确认死亡（${p.identity === 'killer' ? '杀手' : '平民'}）`);
  });
}

// ---------- 击杀核心 ----------
function killPlayer(game, targetId, attackerId) {
  const tgt = game.players.find(x => x.id === targetId);
  const atk = game.players.find(x => x.id === attackerId);
  if (!tgt || !atk || tgt.status !== 'alive' || atk.status !== 'alive') return;
  const tgtLoc = game.locations.find(l => l.id === tgt.locationId);

  // 玛丽·追踪香囊：被追踪者的击杀/被杀记录（含功夫反弹等所有致死路径）
  if (game.trackedPlayerId === attackerId) {
    game.trackRecords.push({ round: game.round, phase: game.phase, action: `击杀了 ${tgt.name}`, locationId: atk.locationId });
  }
  if (game.trackedPlayerId === targetId && attackerId !== targetId) {
    game.trackRecords.push({ round: game.round, phase: game.phase, action: `被 ${atk.name} 击杀`, locationId: tgt.locationId });
  }

  // 功夫反弹
  if (game.kungFuActivePlayers.includes(targetId)) {
    atk.status = 'dying'; // 反弹：攻击者濒死（结算时死）
    addEvent(game, `【功夫反弹】${tgt.name} 反杀了 ${atk.name}（濒死待结算）！`);
    checkEnd(game);
    return;
  }

  // 击杀 → 濒死（延迟死亡：不立即变尸体，等所有人准备推进时结算）
  tgt.status = 'dying';
  addEvent(game, `${tgt.name} 被 ${atk.name} 击杀（濒死待结算）`);

  // 西部荒野变异（封锁在投票结束后统一执行）
  if (tryTransform(game, tgt)) {
    checkEnd(game);
    return;
  }

  // 曼斯顿边境连锁
  if (tgtLoc?.effect?.type === 'mass_civilian_death') {
    game.players.filter(p => p.id !== tgt.id && p.locationId === tgt.locationId && p.status === 'alive' && p.identity === 'civilian')
      .forEach(civ => {
        civ.status = 'dying'; // 连锁：平民濒死（结算时死）
        addEvent(game, `【曼斯顿边境·连锁】${civ.name}（平民）受连锁反应影响（濒死待结算）`);
      });
  }

  checkEnd(game);
}

// ---------- 胜利判定 ----------
function checkEnd(game) {
  const killers = game.players.filter(p => (p.status === 'alive' || p.status === 'dying') && p.identity === 'killer').length;
  const civs = game.players.filter(p => (p.status === 'alive' || p.status === 'dying') && p.identity === 'civilian').length;
  if (killers === 0) {
    game.winner = 'good'; game.phase = 'end';
    addEvent(game, '🏆 好人阵营胜利！所有杀手已被消灭');
    return true;
  }
  if (civs === 0) {
    game.winner = 'evil'; game.phase = 'end';
    addEvent(game, '🏆 杀手阵营胜利！屠城成功');
    return true;
  }
  // 兜底：所有真人玩家出局（调试模式的空壳不算真人，不会操作）
  // 空壳只是占位角色，不能当真人继续撑局 —— 真人全没了直接结束，避免卡死
  const realAlive = game.players.filter(p => (p.status === 'alive' || p.status === 'dying') && !p.isBot).length;
  if (realAlive === 0) {
    game.winner = civs > 0 ? 'good' : 'evil';
    game.phase = 'end';
    addEvent(game, '🏁 所有真人玩家已出局，对局结束');
    return true;
  }
  return false;
}

// 技能可用的阶段前缀（与前端 heroData.ts 的 usablePhase 对齐；服务器权威校验）
const SKILL_PHASES = {
  xiling_kill_same_room: 'action',
  niangao_kungfu: 'action',
  lilongxiang_gunshot: 'vote',
  zhangyang_cut_connection: 'action',
  yeyu_stealth: 'action',
  baiye_track: 'action',
  tianyi_investigate_same_room: 'action',
  zhuxun_double_move: 'move',
};

// 技能使用限制（once_per_game 进 usedSkills；once_per_round 进 roundSkillUsage，每轮重置）
const SKILL_LIMITS = {
  xiling_kill_same_room: 'once_per_game',
  niangao_kungfu: 'once_per_game',
  lilongxiang_gunshot: 'once_per_game',
  zhangyang_cut_connection: 'once_per_game',
  yeyu_stealth: 'once_per_game',
  baiye_track: 'once_per_game',
  tianyi_investigate_same_room: 'once_per_game',
  zhuxun_double_move: 'once_per_round',
};

// ---------- 技能 ----------
function useSkill(game, playerId, skillId, targetId, targetLocationId) {
  const p = game.players.find(x => x.id === playerId);
  if (!p || p.status !== 'alive') return { ok: false, msg: '无效玩家' };

  // 阶段校验（basic_kill 走 attackPlayer 自己的检查）
  if (skillId !== 'basic_kill') {
    const reqPhase = SKILL_PHASES[skillId];
    if (reqPhase === 'vote') {
      if (game.phase !== 'vote') return { ok: false, msg: '仅投票阶段可用' };
    } else if (reqPhase === 'action') {
      if (!game.phase.startsWith('action')) return { ok: false, msg: '仅行动阶段可用' };
    } else if (reqPhase === 'move') {
      if (!game.phase.startsWith('move')) return { ok: false, msg: '仅移动阶段可用' };
    }
  }

  // 次数（basic_kill 不限制）
  if (skillId !== 'basic_kill') {
    const used = game.usedSkills[playerId] || [];
    if (used.includes(skillId)) return { ok: false, msg: '该技能本局已使用' };
    if (SKILL_LIMITS[skillId] === 'once_per_round') {
      const roundUsed = (game.roundSkillUsage[playerId] || {})[skillId] || 0;
      if (roundUsed >= 1) return { ok: false, msg: '该技能本轮已使用' };
    }
  }

  switch (skillId) {
    case 'basic_kill':
      return attackPlayer(game, playerId, targetId);
    case 'xiling_kill_same_room': {
      const t = game.players.find(x => x.id === targetId);
      if (!t || t.locationId !== p.locationId || t.status !== 'alive') return { ok: false, msg: '目标不在同一地点' };
      if (t.id === p.id) return { ok: false, msg: '不能对自己使用' };
      markUsed(game, playerId, skillId);
      killPlayer(game, t.id, p.id);
      return { ok: true };
    }
    case 'niangao_kungfu':
      if (!game.kungFuActivePlayers.includes(playerId)) game.kungFuActivePlayers.push(playerId);
      markUsed(game, playerId, skillId);
      return { ok: true };
    case 'lilongxiang_gunshot': {
      if (game.phase !== 'vote') return { ok: false, msg: '仅投票阶段可用' };
      const t = game.players.find(x => x.id === targetId);
      if (!t || t.status !== 'alive') return { ok: false, msg: '无效目标' };
      if (t.id === p.id) return { ok: false, msg: '不能枪毙自己' };
      markUsed(game, playerId, skillId);
      t.status = 'dead'; t.isRevealed = true;
      addEvent(game, `【枪毙】${p.name} 枪决了 ${t.name}（${t.identity === 'killer' ? '杀手' : '平民'}）`);
      // 西部荒野变异：枪毙在西部荒野的平民同样死而复生变杀手
      if (tryTransform(game, t)) {
        checkEnd(game);
        return { ok: true };
      }
      if (t.identity === 'civilian') {
        p.status = 'dead'; p.isRevealed = true;
        addEvent(game, `【枪毙】${p.name} 误杀好人，陪葬！`);
      }
      checkEnd(game);
      return { ok: true };
    }
    case 'yeyu_stealth':
      p.halted = true;
      markUsed(game, playerId, skillId);
      return { ok: true };
    case 'baiye_track': {
      const t = game.players.find(x => x.id === targetId);
      if (!t || t.locationId !== p.locationId || t.status !== 'alive') return { ok: false, msg: '目标不在同一地点' };
      if (t.id === p.id) return { ok: false, msg: '不能追踪自己' };
      game.trackedPlayerId = targetId;
      game.trackerPlayerId = playerId; // 记录追踪者（追踪报告仅本人可见）
      game.trackRecords = [];
      markUsed(game, playerId, skillId);
      return { ok: true };
    }
    case 'tianyi_investigate_same_room': {
      const t = game.players.find(x => x.id === targetId);
      if (!t || t.locationId !== p.locationId || t.status !== 'alive') return { ok: false, msg: '目标不在同一地点' };
      if (t.id === p.id) return { ok: false, msg: '不能查验自己' };
      markUsed(game, playerId, skillId);
      return { ok: true, reveal: { targetId: t.id, identity: t.identity } };
    }
    case 'zhuxun_double_move':
      p.doubleMoveActive = true; p.doubleMoveFirstDone = false;
      markUsed(game, playerId, skillId);
      return { ok: true };
    case 'zhangyang_cut_connection': {
      if (!targetLocationId || !targetId) return { ok: false, msg: '需要两个地点' };
      const a = game.locations.find(l => l.id === targetId);
      const b = game.locations.find(l => l.id === targetLocationId);
      if (!a || !b) return { ok: false, msg: '地点不存在' };
      if (!a.connectedTo.includes(b.id)) return { ok: false, msg: '两地无道路相连' };
      a.connectedTo = a.connectedTo.filter(x => x !== b.id);
      b.connectedTo = b.connectedTo.filter(x => x !== a.id);
      game.cutConnections.push({ locA: a.id, locB: b.id });
      markUsed(game, playerId, skillId);
      return { ok: true };
    }
    default:
      return { ok: false, msg: '未知技能' };
  }
}

function markUsed(game, playerId, skillId) {
  if (SKILL_LIMITS[skillId] === 'once_per_round') {
    // 每轮一次：per-player 记录，vote_result 阶段整表清空
    if (!game.roundSkillUsage[playerId]) game.roundSkillUsage[playerId] = {};
    game.roundSkillUsage[playerId][skillId] = (game.roundSkillUsage[playerId][skillId] || 0) + 1;
  } else {
    if (!game.usedSkills[playerId]) game.usedSkills[playerId] = [];
    game.usedSkills[playerId].push(skillId);
  }
}

// ---------- 投票 ----------
function submitVotes(game, votes) {
  game.players.forEach(p => { p.votedFor = null; p.voteCount = 0; });
  const seen = new Set(); // 去重：同一玩家只算一票（防重复提交刷票）
  votes.forEach(v => {
    if (seen.has(v.voterId)) return;
    seen.add(v.voterId);
    const voter = game.players.find(p => p.id === v.voterId);
    const target = game.players.find(p => p.id === v.targetId);
    if (voter && target && voter.status === 'alive' && target.status === 'alive') {
      voter.votedFor = target.id;
      target.voteCount++;
    }
  });
}

function handleVoteEnd(game) {
  const maxVotes = Math.max(...game.players.map(p => p.voteCount), 0);
  if (maxVotes > 0) {
    game.players.filter(p => p.voteCount === maxVotes && p.status === 'alive').forEach(p => {
      p.status = 'dead'; p.isRevealed = true;
      addEvent(game, `${p.name} 被投票出局（${p.identity === 'killer' ? '杀手' : '平民'}）`);
    });
  }
  // 西部荒野变异：投票出局在西部荒野的平民同样死而复生变杀手（先于尸体清理）
  game.players.forEach(p => { if (p.status === 'dead') tryTransform(game, p); });
  // 投票阶段结束 → 统一封锁本轮所有死亡地点（行动阶段被杀 + 投票出局）
  // （不在杀人时立即封锁，符合"投票结束后才封锁"的规则）
  const deathLocs = new Set(
    game.players.filter(p => (p.status === 'dead' || p.status === 'dying') && p.locationId).map(p => p.locationId)
  );
  deathLocs.forEach(locId => blockLocation(game, locId));
  // 清理尸体
  game.players.forEach(p => { if (p.status === 'dead') p.locationId = ''; });
  // 存活重排
  const av = game.locations.filter(l => !l.isBlocked);
  if (av.length) game.players.filter(p => p.status === 'alive').forEach(p => {
    p.locationId = av[Math.floor(Math.random() * av.length)].id;
  });
  // 重置
  game.players.forEach(p => {
    p.votedFor = null; p.voteCount = 0;
    if (p.halted) p.halted = false;
    if (p.identity === 'killer') { p.normalAttackRemaining = 1; p.asylumAttackRemaining = 0; }
  });
  // 重排/重置后：身处死人沼泽的杀手补额外攻击（覆盖"被随机重排到死人沼泽"场景）
  grantAsylumIfInMarsh(game);
  game.locationVisits = {};
  game.trackedPlayerId = null; game.trackerPlayerId = null; game.trackRecords = [];
  game.droneLocationId = null; game.dronePlayerId = null;
  game.phase = 'vote_result';
  // 兜底：投票后真人全灭（如调试模式房主被投死）→ 立即判定结束，
  // 否则 vote_result 阶段没有任何真人能点「下一轮」，游戏会卡死
  const realAlive = game.players.filter(p => (p.status === 'alive' || p.status === 'dying') && !p.isBot).length;
  if (realAlive === 0) checkEnd(game);
}

function addEvent(game, text) {
  game.events.push({ round: game.round, phase: game.phase, text, ts: Date.now() });
  if (game.events.length > 50) game.events.shift();
}

// 封锁地点（死寂荒漠 unblockable 除外）；封锁 = 本轮不可进入
function blockLocation(game, locId) {
  const loc = game.locations.find(l => l.id === locId);
  if (!loc || loc.isBlocked || loc.effect?.type === 'unblockable') return;
  loc.isBlocked = true;
  if (!game.blockedLocations.includes(locId)) game.blockedLocations.push(locId);
  addEvent(game, `🔒 ${loc.name} 因有人在此死亡而被封锁（本轮不可进入）`);
}

// 解除封锁（西部荒野变异复活时撤销）
function unblockLocation(game, locId) {
  const loc = game.locations.find(l => l.id === locId);
  if (!loc) return;
  loc.isBlocked = false;
  game.blockedLocations = game.blockedLocations.filter(id => id !== locId);
}

export {
  createGame, serializeGame, nextPhase, movePlayer, attackPlayer,
  useSkill, submitVotes, checkEnd, killPlayer, settleDeaths, PHASE_NAMES,
};
