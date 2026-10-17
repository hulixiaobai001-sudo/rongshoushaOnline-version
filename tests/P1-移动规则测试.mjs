// ============================================================
// P1-2 移动规则单元测试
// 覆盖：移动次数限制、传送、疾行两次、死人湾单向、停步、阶段重置
// 运行：node tests/P1-移动规则测试.mjs
// ============================================================
import { createGame, useSkill, nextPhase, movePlayer } from '../server/gameEngine.js';

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
}

// 2 人局，固定地图位置：A 在死寂荒漠（连接甘露/曼斯顿…），B 随意
function makeGame() {
  const g = createGame({ hostName: 'H', players: ['A', 'B'], killerCount: 1, botNames: [] });
  g.phase = 'move1';
  const loc = (name) => g.locations.find(l => l.name === name);
  g.players[0].locationId = loc('死寂荒漠').id;
  g.players[1].locationId = loc('双阳').id;
  g.players.forEach(p => { p.status = 'alive'; p.movedThisPhase = false; });
  return g;
}
const locId = (g, name) => g.locations.find(l => l.name === name).id;

console.log('\n【1】移动次数：一个移动阶段只能移动一次');
{
  const g = makeGame();
  const p = g.players[0];
  const r1 = movePlayer(g, p.id, locId(g, '甘露之地'));
  check('第一次相邻移动成功', r1.ok === true, JSON.stringify(r1));
  check('返回新地点名', r1.locationName === '甘露之地', String(r1.locationName));
  const r2 = movePlayer(g, p.id, locId(g, '曼斯顿边境'));
  check('同一阶段第二次移动被拒绝', r2.ok === false && r2.msg === '本阶段已移动', JSON.stringify(r2));
  check('地点没有被第二次移动改变', p.locationId === locId(g, '甘露之地'));
}

console.log('\n【2】阶段重置：离开移动阶段后可以再次移动');
{
  const g = makeGame();
  const p = g.players[0];
  movePlayer(g, p.id, locId(g, '甘露之地'));
  nextPhase(g); // move1 → action2
  nextPhase(g); // action2 → move2
  check('已进入 move2', g.phase === 'move2', g.phase);
  check('新移动阶段 movedThisPhase 已重置', p.movedThisPhase === false, String(p.movedThisPhase));
  const r = movePlayer(g, p.id, locId(g, '死寂荒漠'));
  check('新移动阶段可以再次移动', r.ok === true, JSON.stringify(r));
}

console.log('\n【3】传送：无视相邻关系，可达任意未封锁地点');
{
  const g = makeGame();
  const p = g.players[0];
  p.heroId = 'fengming';
  const cast = useSkill(g, p.id, 'fengming_teleport');
  check('传送技能释放成功', cast.ok === true, JSON.stringify(cast));
  check('teleportReady = true', p.teleportReady === true);
  const far = locId(g, '曼城'); // 死寂荒漠与曼城不相邻
  const r = movePlayer(g, p.id, far);
  check('传送可到达非相邻地点', r.ok === true, JSON.stringify(r));
  check('返回 teleport = true', r.teleport === true, JSON.stringify(r));
  check('传送消耗后 teleportReady = false', p.teleportReady === false);
  check('人已到曼城', p.locationId === far);
}

console.log('\n【4】传送也不能进入已封锁地点');
{
  const g = makeGame();
  const p = g.players[0];
  p.teleportReady = true;
  const blocked = g.locations.find(l => l.name === '曼城');
  blocked.isBlocked = true;
  const r = movePlayer(g, p.id, blocked.id);
  check('封锁地点被拒绝', r.ok === false && r.msg.includes('已封锁'), JSON.stringify(r));
  check('teleportReady 未被白白消耗', p.teleportReady === true);
}

console.log('\n【5】疾行：本阶段可移动两次，第三次拒绝');
{
  const g = makeGame();
  const p = g.players[0];
  p.heroId = 'zhuxun';
  const cast = useSkill(g, p.id, 'zhuxun_double_move');
  check('疾行释放成功', cast.ok === true, JSON.stringify(cast));
  const r1 = movePlayer(g, p.id, locId(g, '甘露之地'));
  check('疾行第一次移动成功', r1.ok === true, JSON.stringify(r1));
  check('返回提示还能移动（doubleMoveActive）', r1.doubleMoveActive === true, JSON.stringify(r1));
  const r2 = movePlayer(g, p.id, locId(g, '曼斯顿边境'));
  check('疾行第二次移动成功', r2.ok === true, JSON.stringify(r2));
  check('疾行状态已消耗', p.doubleMoveActive === false && p.doubleMoveFirstDone === false);
  const r3 = movePlayer(g, p.id, locId(g, '死寂荒漠'));
  check('第三次移动被拒绝', r3.ok === false, JSON.stringify(r3));
}

console.log('\n【6】普通玩家（无疾行）第二次移动直接被拒绝');
{
  const g = makeGame();
  const p = g.players[0];
  movePlayer(g, p.id, locId(g, '甘露之地'));
  const r = movePlayer(g, p.id, locId(g, '死寂荒漠'));
  check('无疾行不能连走两步', r.ok === false && r.msg === '本阶段已移动', JSON.stringify(r));
}

console.log('\n【7】死人湾单向 + 非法相邻');
{
  const g = makeGame();
  const p = g.players[0];
  p.locationId = locId(g, '死人湾');
  const rBridge = movePlayer(g, p.id, locId(g, '甘露之地'));
  check('死人湾可跳到甘露之地（单向桥）', rBridge.ok === true, JSON.stringify(rBridge));

  const g2 = makeGame();
  const p2 = g2.players[0];
  const rFar = movePlayer(g2, p2.id, locId(g2, '曼城'));
  check('普通移动不能跨图', rFar.ok === false && rFar.msg.includes('无法到达'), JSON.stringify(rFar));
}

console.log('\n【8】停步状态不能移动');
{
  const g = makeGame();
  const p = g.players[0];
  p.halted = true;
  const r = movePlayer(g, p.id, locId(g, '甘露之地'));
  check('停步玩家移动被拒绝', r.ok === false && r.msg.includes('停步'), JSON.stringify(r));
}

console.log(`\n${'='.repeat(50)}`);
console.log(`结果：${pass} 通过 / ${fail} 失败`);
console.log(`${'='.repeat(50)}\n`);
process.exit(fail === 0 ? 0 : 1);
