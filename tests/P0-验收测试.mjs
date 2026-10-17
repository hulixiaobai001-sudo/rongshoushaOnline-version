// ============================================================
// P0 修复验收测试（针对 server/gameEngine.js）
// 运行：node tests/P0-验收测试.mjs
// ============================================================
import { createGame, useSkill, serializeGame } from '../server/gameEngine.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

// 造一局：2 个玩家，一个 xiling，一个 niangao，同地点
function makeGame() {
  const g = createGame({ hostName: 'H', players: ['A', 'B'], killerCount: 1, botNames: [] });
  g.players[0].heroId = 'xiling';
  g.players[0].identity = 'killer';
  g.players[1].heroId = 'niangao';
  g.players[1].identity = 'civilian';
  g.locations = [{ id: 'L1', name: '曼城', connectedTo: ['L2'], isBlocked: false, x: 0, y: 0, effect: { type: 'no_attack', name: '禁武' } },
                 { id: 'L2', name: '甘露之地', connectedTo: ['L1'], isBlocked: false, x: 0, y: 0 }];
  g.players.forEach(p => { p.locationId = 'L1'; p.status = 'alive'; });
  g.phase = 'action1';
  return g;
}

console.log('\n【1】白名单反转：未登记技能必须被拒绝');
{
  const g = makeGame();
  const r = useSkill(g, g.players[0].id, 'nonexistent_skill', g.players[1].id);
  check('未知技能被拒绝', r.ok === false && r.msg === '未知技能', `实际: ${JSON.stringify(r)}`);
  const r2 = useSkill(g, g.players[0].id, 'fengming_teleport', g.players[1].id);
  check('登记了但非本命英雄的技能被拒绝', r2.ok === false && r2.msg === '这不是你的技能', `实际: ${JSON.stringify(r2)}`);
}

console.log('\n【2】英雄归属：不能使用别人的技能');
{
  const g = makeGame();
  // niangao（平民）试图用 xiling 的影杀杀人
  const r = useSkill(g, g.players[1].id, 'xiling_kill_same_room', g.players[0].id);
  check('平民无法用他人技能杀人', r.ok === false && r.msg === '这不是你的技能', `实际: ${JSON.stringify(r)}`);
  check('目标仍然存活', g.players[0].status === 'alive', `实际: ${g.players[0].status}`);
}
{
  const g = makeGame();
  // 平民试图用 tianyi 的识破查验身份
  const r = useSkill(g, g.players[1].id, 'tianyi_investigate_same_room', g.players[0].id);
  check('无法用他人技能查验身份', r.ok === false, `实际: ${JSON.stringify(r)}`);
  check('没有泄露 reveal 字段', !r.reveal, `实际: ${JSON.stringify(r.reveal)}`);
}
{
  const g = makeGame();
  // 自己的技能必须仍然可用
  const r = useSkill(g, g.players[0].id, 'xiling_kill_same_room', g.players[1].id);
  check('本命英雄的技能仍然可用', r.ok === true, `实际: ${JSON.stringify(r)}`);
  check('目标进入濒死', g.players[1].status === 'dying', `实际: ${g.players[1].status}`);
}

console.log('\n【3】序列化：攻击计数器只发给本人');
{
  const g = makeGame();
  const victimId = g.players[1].id;
  const attackerId = g.players[0].id;
  g.players[0].asylumAttackRemaining = 1; // 杀手进过死人沼泽
  g.players[1].asylumAttackRemaining = 0;
  g.players[0].normalAttackRemaining = 0; // 杀手已出刀

  const forVictim = serializeGame(g, victimId);
  const seen0 = forVictim.players.find(p => p.id === attackerId);
  const seen1 = forVictim.players.find(p => p.id === victimId);
  check('别人看不到杀手的 asylumAttackRemaining', seen0.asylumAttackRemaining === undefined, `实际: ${seen0.asylumAttackRemaining}`);
  check('别人看不到杀手的 normalAttackRemaining', seen0.normalAttackRemaining === undefined, `实际: ${seen0.normalAttackRemaining}`);
  check('本人仍能看到自己的计数', seen1.normalAttackRemaining !== undefined || seen1.asylumAttackRemaining !== undefined,
    `实际: normal=${seen1.normalAttackRemaining} asylum=${seen1.asylumAttackRemaining}`);

  const forAttacker = serializeGame(g, attackerId);
  const me = forAttacker.players.find(p => p.id === attackerId);
  check('杀手本人能看到自己的刀数（UI 依赖）', me.normalAttackRemaining === 0 && me.asylumAttackRemaining === 1,
    `实际: normal=${me.normalAttackRemaining} asylum=${me.asylumAttackRemaining}`);
  // 确认身份泄露原路径已断：不再能靠计数器反推
  const inferable = forVictim.players.filter(p => p.asylumAttackRemaining === 1);
  check('无法靠计数器反推杀手', inferable.length === 0, `泄露了 ${inferable.length} 人`);
}

console.log('\n【4】英雄池扩容：13 个英雄都能被分配到');
{
  const names = ['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10','p11','p12','p13'];
  const g = createGame({ hostName: 'H', players: names, killerCount: 3, botNames: [] });
  const heroes = g.players.map(p => p.heroId);
  const uniq = new Set(heroes);
  check('13 人拿到 13 个不重复英雄', uniq.size === 13, `实际 ${uniq.size} 个: ${heroes.join(',')}`);
  const expected = ['xiling','niangao','lilongxiang','zhangyang','yeyu','baiye','tianyi','zhuxun','kexiong','fengming','wangli','yanzhuo','jiangfeng'];
  const missing = expected.filter(h => !uniq.has(h));
  check('5 个原本被锁的英雄已进入池子', missing.length === 0, `缺失: ${missing.join(',')}`);
}

console.log('\n【5】新解锁技能的实现存在（用对应英雄调用）');
{
  const cases = [
    ['kexiong_investigate', 'kexiong', 'action1'],
    ['fengming_teleport',   'fengming', 'move1'],
    ['wangli_big_shot',     'wangli',   'action1'],
    ['yanzhuo_suplex',      'yanzhuo',  'action1'],
    ['jiangfeng_drone',     'jiangfeng','action1'],
  ];
  for (const [skill, hero, phase] of cases) {
    const g = makeGame();
    g.players[0].heroId = hero;
    g.phase = phase;
    g.players[0].locationId = 'L1';
    g.players[1].locationId = 'L1';
    const r = useSkill(g, g.players[0].id, skill, g.players[1].id, 'L2');
    check(`${skill} 已实现且可用`, r.ok === true, `实际: ${JSON.stringify(r)}`);
  }
}

console.log(`\n${'='.repeat(50)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
console.log(`${'='.repeat(50)}\n`);
process.exit(fail === 0 ? 0 : 1);
