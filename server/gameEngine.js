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

// ---------- 创建游戏 ----------
function createGame({ hostName, players: names, killerCount }) {
  const total = names.length;
  const targetKillers = killerCount > 0 ? Math.min(killerCount, Math.floor(total / 2)) : Math.max(1, Math.floor(total / 2));

  // 玩家
  const players = names.map((n, i) => ({
    id: genId('p'), name: n, identity: '', status: 'alive',
    locationId: '', isRevealed: false, heroId: '',
    halted: false, teleportReady: false, doubleMoveActive: false, doubleMoveFirstDone: false,
    normalAttackRemaining: 1, asylumAttackRemaining: 0,
    votedFor: null, voteCount: 0,
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
  const locations = DEFAULT_MAP.map(l => ({ ...l, isBlocked: false, effect: LOCATION_EFFECTS[l.name] ? { type: LOCATION_EFFECTS[l.name], name: l.name } : null }));

  // 随机放置
  players.forEach(p => {
    p.locationId = locations[Math.floor(Math.random() * locations.length)].id;
  });

  return {
    phase: 'action1', round: 1, winner: null,
    players, locations,
    blockedLocations: [], cutConnections: [],
    kungFuActivePlayers: [], pendingAttacks: [],
    usedSkills: {}, roundSkillUsage: {},
    locationVisits: {}, trackedPlayerId: null, trackRecords: [],
    droneLocationId: null, dronePlayerId: null, droneRound: 0,
    events: [],
  };
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
      normalAttackRemaining: p.normalAttackRemaining, asylumAttackRemaining: p.asylumAttackRemaining,
      // 身份：只给本人或已暴露（死亡/枪毙）
      identity: (p.id === viewerId || p.isRevealed) ? p.identity : undefined,
    })),
    locations: game.locations.map(l => ({ ...l })),
    blockedLocations: game.blockedLocations,
    cutConnections: game.cutConnections,
    kungFuActivePlayers: game.kungFuActivePlayers,
    pendingAttacks: game.pendingAttacks,
    usedSkills: game.usedSkills,
    roundSkillUsage: game.roundSkillUsage,
    locationVisits: game.locationVisits,
    trackedPlayerId: game.trackedPlayerId,
    trackRecords: game.trackRecords,
    droneLocationId: game.droneLocationId,
    events: game.events.slice(-20),
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
  if (atk.locationId !== tgt.locationId) return { ok: false, msg: '目标不在同一地点' };

  const atkLoc = game.locations.find(l => l.id === atk.locationId);
  if (atkLoc?.effect?.type === 'no_attack') return { ok: false, msg: '【曼城·禁武】此地点禁止攻击' };

  // 次数检查
  const inAsylum = atkLoc?.effect?.type === 'asylum_extra_attack';
  if (inAsylum) {
    if (atk.asylumAttackRemaining <= 0) return { ok: false, msg: '本轮已攻击过' };
    atk.asylumAttackRemaining--;
  } else {
    if (atk.normalAttackRemaining <= 0) return { ok: false, msg: '本轮已攻击过' };
    atk.normalAttackRemaining--;
  }

  killPlayer(game, tgt.id, atk.id);
  return { ok: true };
}

// ---------- 击杀核心 ----------
function killPlayer(game, targetId, attackerId) {
  const tgt = game.players.find(x => x.id === targetId);
  const atk = game.players.find(x => x.id === attackerId);
  if (!tgt || !atk || tgt.status !== 'alive' || atk.status !== 'alive') return;
  const tgtLoc = game.locations.find(l => l.id === tgt.locationId);

  // 功夫反弹
  if (game.kungFuActivePlayers.includes(targetId)) {
    atk.status = 'dead';
    atk.isRevealed = true;
    addEvent(game, `【功夫反弹】${tgt.name} 反杀了 ${atk.name}！`);
    checkEnd(game);
    return;
  }

  // 击杀
  tgt.status = 'dead';
  tgt.isRevealed = true;
  addEvent(game, `${tgt.name}（${tgt.identity === 'killer' ? '杀手' : '平民'}）被 ${atk.name} 击杀`);

  // 西部荒野变异
  if (tgtLoc?.effect?.type === 'identity_transform' && tgt.identity === 'civilian') {
    tgt.status = 'alive';
    tgt.identity = 'killer';
    tgt.isRevealed = false;
    addEvent(game, `【西部荒野·变异】${tgt.name} 死而复生！身份从平民转变为杀手！`);
    checkEnd(game);
    return;
  }

  // 曼斯顿边境连锁
  if (tgtLoc?.effect?.type === 'mass_civilian_death') {
    game.players.filter(p => p.id !== tgt.id && p.locationId === tgt.locationId && p.status === 'alive' && p.identity === 'civilian')
      .forEach(civ => {
        civ.status = 'dead';
        civ.isRevealed = true;
        addEvent(game, `【曼斯顿边境·连锁】${civ.name}（平民）受连锁反应影响死亡`);
      });
  }

  checkEnd(game);
}

// ---------- 胜利判定 ----------
function checkEnd(game) {
  const killers = game.players.filter(p => p.status === 'alive' && p.identity === 'killer').length;
  const civs = game.players.filter(p => p.status === 'alive' && p.identity === 'civilian').length;
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
  return false;
}

// ---------- 技能 ----------
function useSkill(game, playerId, skillId, targetId, targetLocationId) {
  const p = game.players.find(x => x.id === playerId);
  if (!p || p.status !== 'alive') return { ok: false, msg: '无效玩家' };

  // 次数
  if (skillId !== 'basic_kill') {
    const used = game.usedSkills[playerId] || [];
    if (used.includes(skillId)) return { ok: false, msg: '该技能本局已使用' };
  }

  switch (skillId) {
    case 'basic_kill':
      return attackPlayer(game, playerId, targetId);
    case 'xiling_kill_same_room': {
      const t = game.players.find(x => x.id === targetId);
      if (!t || t.locationId !== p.locationId || t.status !== 'alive') return { ok: false, msg: '目标不在同一地点' };
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
      markUsed(game, playerId, skillId);
      t.status = 'dead'; t.isRevealed = true;
      addEvent(game, `【枪毙】${p.name} 枪决了 ${t.name}（${t.identity === 'killer' ? '杀手' : '平民'}）`);
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
      game.trackedPlayerId = targetId;
      game.trackRecords = [];
      markUsed(game, playerId, skillId);
      return { ok: true };
    }
    case 'tianyi_investigate_same_room': {
      const t = game.players.find(x => x.id === targetId);
      if (!t || t.locationId !== p.locationId || t.status !== 'alive') return { ok: false, msg: '目标不在同一地点' };
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
  if (!game.usedSkills[playerId]) game.usedSkills[playerId] = [];
  game.usedSkills[playerId].push(skillId);
}

// ---------- 投票 ----------
function submitVotes(game, votes) {
  game.players.forEach(p => { p.votedFor = null; p.voteCount = 0; });
  votes.forEach(v => {
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
  game.locationVisits = {};
  game.trackedPlayerId = null; game.trackRecords = [];
  game.droneLocationId = null; game.dronePlayerId = null;
  game.phase = 'vote_result';
}

function addEvent(game, text) {
  game.events.push({ round: game.round, phase: game.phase, text, ts: Date.now() });
  if (game.events.length > 50) game.events.shift();
}

export {
  createGame, serializeGame, nextPhase, movePlayer, attackPlayer,
  useSkill, submitVotes, checkEnd, killPlayer, PHASE_NAMES,
};
