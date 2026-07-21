import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { getIdentityColor, getIdentityName } from '@/types/game';
import { getHeroById } from '@/data/heroData';
import { getPlayersAtLocation, getAllPlayersAtLocation } from '@/data/gameData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import {
  Navigation,
  Skull,
  Heart,
  Lock,
  MapPin,
  ChevronRight,
  Vote,
  AlertTriangle,
  Crosshair,
  Eye,
  EyeOff,
} from 'lucide-react';

const MAP_W = 100;
const MAP_H = 100;

// ==================== 投票阶段主界面 ====================

export function VotePhase() {
  const {
    round,
    players,
    locations,
    nextPhase,
    submitVotes,
    executeGunShot,
    usedSkills,
  } = useGameStore();

  // 每个角色的投票选择：playerId -> { isVoting: boolean, targetId: string | null }
  const [voteChoices, setVoteChoices] = useState<Record<string, { isVoting: boolean; targetId: string | null }>>(
    () => {
      const init: Record<string, { isVoting: boolean; targetId: string | null }> = {};
      players.forEach((p) => {
        if (p.status === 'alive') {
          init[p.id] = { isVoting: false, targetId: null };
        }
      });
      return init;
    }
  );

  const alivePlayers = players.filter((p) => p.status === 'alive');
  const deadPlayers = players.filter((p) => p.status === 'dead');

  // 实时票数统计
  const voteCounts: Record<string, number> = {};
  alivePlayers.forEach((p) => {
    const choice = voteChoices[p.id];
    if (choice?.isVoting && choice.targetId) {
      voteCounts[choice.targetId] = (voteCounts[choice.targetId] || 0) + 1;
    }
  });

  // 切换是否投票
  const toggleVoting = (playerId: string) => {
    setVoteChoices((prev) => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        isVoting: !prev[playerId]?.isVoting,
        targetId: prev[playerId]?.isVoting ? null : prev[playerId]?.targetId,
      },
    }));
  };

  // 设置投票目标
  const setTarget = (voterId: string, targetId: string) => {
    setVoteChoices((prev) => ({
      ...prev,
      [voterId]: {
        ...prev[voterId],
        targetId,
      },
    }));
  };

  // 提交投票
  const handleConfirmVote = () => {
    // 收集所有投票选择
    const votes: Array<{ voterId: string; targetId: string }> = [];
    alivePlayers.forEach((p) => {
      const choice = voteChoices[p.id];
      if (choice?.isVoting && choice.targetId) {
        votes.push({ voterId: p.id, targetId: choice.targetId });
      }
    });
    // 一次性提交所有投票到 store
    submitVotes(votes);
    // 进入下一阶段（自动淘汰 + 重置位置）
    nextPhase();
  };

  return (
    <div className="h-full flex flex-col gap-3">
      {/* 顶部状态栏 */}
      <div className="flex items-center gap-3 bg-white rounded-lg border px-4 py-3">
        <Badge variant="secondary" className="text-sm font-mono shrink-0">
          第 {round} 轮
        </Badge>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Vote className="w-5 h-5 text-amber-600" />
            投票阶段
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
            <Heart className="w-3 h-3 mr-1" />
            存活 {alivePlayers.length}
          </Badge>
          {deadPlayers.length > 0 && (
            <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50">
              <Skull className="w-3 h-3 mr-1" />
              死亡 {deadPlayers.length}
            </Badge>
          )}
        </div>
      </div>

      {/* 操作提示 */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-800">
          为每个存活角色选择是否投票及投票目标。确认后自动淘汰票数最高的玩家，并将所有存活角色随机放置到未被封锁的地点。
        </p>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
        {/* 左侧：地图 + 死亡角色 */}
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          {/* 地图 */}
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="pb-2 shrink-0">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Navigation className="w-4 h-4 text-blue-600" />
                当前地图状态
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 p-2">
              <VoteMapView />
            </CardContent>
          </Card>

          {/* 死亡角色 */}
          {deadPlayers.length > 0 && (
            <Card className="shrink-0">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-red-600">
                  <Skull className="w-4 h-4" />
                  死亡角色（{deadPlayers.length}）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {deadPlayers.map((p, i) => {
                    const hero = p.heroId ? getHeroById(p.heroId) : null;
                    const loc = locations.find((l) => l.id === p.locationId);
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-md bg-red-50 border border-red-200"
                      >
                        <span className="text-sm font-bold text-slate-500">#{i + 1}</span>
                        <span className="text-sm font-medium text-slate-700 line-through">
                          {p.name}
                        </span>
                        {hero && (
                          <Badge
                            variant="outline"
                            className="text-xs"
                            style={{ borderColor: hero.color + '60', color: hero.color }}
                          >
                            {hero.name}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className="text-xs"
                          style={{
                            borderColor: getIdentityColor(p.identity),
                            color: getIdentityColor(p.identity),
                          }}
                        >
                          {getIdentityName(p.identity)}
                        </Badge>
                        {loc && (
                          <span className="text-xs text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {loc.name}
                            {loc.isBlocked && <Lock className="w-3 h-3 text-red-500" />}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 右侧：投票卡片 */}
        <Card className="w-full lg:w-[520px] shrink-0 flex flex-col min-h-0">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Vote className="w-4 h-4 text-amber-600" />
              投票操作
              <Badge variant="outline" className="ml-auto text-xs">
                实时票数
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0">
            <ScrollArea className="h-full px-4 pb-4">
              <div className="space-y-3">
                {alivePlayers.map((player, index) => (
                  <VoteCard
                    key={player.id}
                    index={index}
                    player={player}
                    allPlayers={alivePlayers}
                    voteChoice={voteChoices[player.id] || { isVoting: false, targetId: null }}
                    voteCounts={voteCounts}
                    usedSkills={usedSkills}
                    onToggleVoting={() => toggleVoting(player.id)}
                    onSetTarget={(targetId) => setTarget(player.id, targetId)}
                    onExecuteGunShot={(targetId) => executeGunShot(player.id, targetId)}
                  />
                ))}

                {/* 票数预览 */}
                <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-700 mb-2">当前票数统计</p>
                  <div className="space-y-1">
                    {alivePlayers.map((p) => {
                      const count = voteCounts[p.id] || 0;
                      return (
                        <div key={p.id} className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">{p.name}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-500 rounded-full transition-all"
                                style={{
                                  width: `${alivePlayers.length > 0 ? (count / alivePlayers.length) * 100 : 0}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs font-mono w-4 text-right">{count}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* 底部确认 */}
      <div className="flex gap-2 shrink-0">
        <Button onClick={handleConfirmVote} className="flex-1 font-semibold bg-amber-600 hover:bg-amber-700" size="sm">
          <Vote className="w-4 h-4 mr-1.5" />
          确认投票结果（自动淘汰 + 重置位置）
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ==================== 投票卡片 ====================

function VoteCard({
  index,
  player,
  allPlayers,
  voteChoice,
  voteCounts,
  usedSkills,
  onToggleVoting,
  onSetTarget,
  onExecuteGunShot,
}: {
  index: number;
  player: import('@/types/game').Player;
  allPlayers: import('@/types/game').Player[];
  voteChoice: { isVoting: boolean; targetId: string | null };
  voteCounts: Record<string, number>;
  usedSkills: Record<string, string[]>;
  onToggleVoting: () => void;
  onSetTarget: (targetId: string) => void;
  onExecuteGunShot: (targetId: string) => void;
}) {
  const playerNum = index + 1;
  const hero = player.heroId ? getHeroById(player.heroId) : null;
  const heroColor = hero ? hero.color : '#6b7280';
  const currentVotes = voteCounts[player.id] || 0;

  // 其他可选目标（排除自己）
  const targets = allPlayers.filter((p) => p.id !== player.id);

  // 枪毙技能状态
  const isLiLongxiang = player.heroId === 'lilongxiang';
  const gunShotUsed = isLiLongxiang && (usedSkills[player.id]?.includes('lilongxiang_gunshot') || false);
  const [gunShotTarget, setGunShotTarget] = useState<string | null>(null);

  return (
    <div className="rounded-lg border bg-white transition-all">
      {/* 头部 */}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-100">
        {/* 编号 */}
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-indigo-100 text-indigo-700">
          {playerNum}
        </div>

        {/* 名字 */}
        <span className="text-sm font-bold text-slate-900">{player.name}</span>

        {/* 英雄 */}
        {hero && (
          <Badge
            variant="outline"
            className="text-xs shrink-0"
            style={{ borderColor: heroColor + '60', color: heroColor }}
          >
            {hero.name}
          </Badge>
        )}
        {hero && (
          <span
            className="text-[10px] px-1 rounded font-mono shrink-0"
            style={{ backgroundColor: heroColor + '15', color: heroColor }}
          >
            速{hero.speed}
          </span>
        )}

        {/* 票数 */}
        <div className="ml-auto flex items-center gap-2">
          {currentVotes > 0 && (
            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-300">
              <Vote className="w-3 h-3 mr-0.5" />
              {currentVotes} 票
            </Badge>
          )}

          {/* 是否投票开关 */}
          <div className="flex items-center gap-1.5">
            <Switch
              checked={voteChoice.isVoting}
              onCheckedChange={onToggleVoting}
              id={`vote-switch-${player.id}`}
            />
            <label
              htmlFor={`vote-switch-${player.id}`}
              className={`text-xs font-medium cursor-pointer ${
                voteChoice.isVoting ? 'text-amber-700' : 'text-slate-400'
              }`}
            >
              {voteChoice.isVoting ? '投票' : '弃票'}
            </label>
          </div>
        </div>
      </div>

      {/* 投票目标选择 */}
      {voteChoice.isVoting && (
        <div className="px-3 py-2">
          <p className="text-xs text-slate-500 mb-1.5">选择投票目标：</p>
          <div className="flex flex-wrap gap-1.5">
            {targets.map((target) => {
              const targetHero = target.heroId ? getHeroById(target.heroId) : null;
              const isSelected = voteChoice.targetId === target.id;
              return (
                <Button
                  key={target.id}
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onSetTarget(target.id)}
                  className={`h-7 px-2 text-xs ${
                    isSelected
                      ? 'bg-amber-600 text-white hover:bg-amber-700 border-amber-600'
                      : 'border-slate-300 text-slate-600 hover:border-amber-400 hover:text-amber-700'
                  }`}
                >
                  {target.name}
                  {targetHero && (
                    <span
                      className="ml-1 text-[10px] opacity-70"
                      style={{ color: isSelected ? 'white' : targetHero.color }}
                    >
                      {targetHero.name}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* 枪毙技能（李龙祥专属） */}
      {isLiLongxiang && (
        <div className="px-3 py-2 border-t border-red-100 bg-red-50/50">
          <div className="flex items-center gap-2 mb-1.5">
            <Crosshair className="w-3.5 h-3.5 text-red-600" />
            <span className="text-xs font-bold text-red-700">枪毙</span>
            {gunShotUsed ? (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-slate-100 text-slate-500 border-slate-300">
                已使用
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-red-50 text-red-600 border-red-300">
                可使用
              </Badge>
            )}
          </div>
          {gunShotUsed ? (
            <p className="text-[11px] text-slate-500">本局已使用过枪毙技能</p>
          ) : (
            <>
              <p className="text-[11px] text-red-600/80 mb-1.5">
                选择一名玩家枪决（目标死亡并公布身份；若目标为好人，李龙祥也死亡）
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {allPlayers
                  .filter((p) => p.id !== player.id && p.status === 'alive')
                  .map((target) => {
                    const targetHero = target.heroId ? getHeroById(target.heroId) : null;
                    const isSelected = gunShotTarget === target.id;
                    return (
                      <Button
                        key={target.id}
                        variant={isSelected ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setGunShotTarget(isSelected ? null : target.id)}
                        className={`h-7 px-2 text-xs ${
                          isSelected
                            ? 'bg-red-600 text-white hover:bg-red-700 border-red-600'
                            : 'border-slate-300 text-slate-600 hover:border-red-400 hover:text-red-700'
                        }`}
                      >
                        {target.name}
                        {targetHero && (
                          <span
                            className="ml-1 text-[10px] opacity-70"
                            style={{ color: isSelected ? 'white' : targetHero.color }}
                          >
                            {targetHero.name}
                          </span>
                        )}
                      </Button>
                    );
                  })}
              </div>
              {gunShotTarget && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full h-8 text-xs font-bold bg-red-600 hover:bg-red-700"
                  onClick={() => {
                    if (gunShotTarget) {
                      onExecuteGunShot(gunShotTarget);
                      setGunShotTarget(null);
                    }
                  }}
                >
                  <Crosshair className="w-3.5 h-3.5 mr-1" />
                  执行枪决
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== 投票阶段地图 ====================

function VoteMapView() {
  const { locations, players, cutConnections } = useGameStore();
  const [showKillers, setShowKillers] = useState(true);

  // 存活玩家
  const getAlivePlayers = (locId: string) =>
    getPlayersAtLocation(players, locId);
  // 包含尸体
  const getAllPlayers = (locId: string) =>
    getAllPlayersAtLocation(players, locId);

  // 获取玩家显示颜色
  const getPlayerColor = (identity: string) => {
    if (!showKillers) return '#3b82f6'; // 不显示杀手时全部蓝色
    return identity === 'killer' ? '#dc2626' : '#3b82f6';
  };

  return (
    <div className="w-full h-full relative">
      {/* 显示模式切换按钮 */}
      <button
        onClick={() => setShowKillers(!showKillers)}
        className="absolute top-2 right-2 z-10 bg-white/95 backdrop-blur rounded-md px-2.5 py-1.5 shadow-sm border text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50 transition-colors"
        title={showKillers ? '切换到不显示杀手' : '切换到显示杀手'}
      >
        {showKillers ? (
          <>
            <Eye className="w-3.5 h-3.5 text-red-600" />
            <span className="text-red-700">显示杀手</span>
          </>
        ) : (
          <>
            <EyeOff className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-blue-700">隐藏杀手</span>
          </>
        )}
      </button>

      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="w-full h-full bg-slate-50 rounded-lg border"
        style={{ maxHeight: '100%' }}
      >
        {/* 连线 */}
        {locations.map((loc) =>
          loc.connectedTo.map((connId) => {
            if (connId <= loc.id) return null;
            const target = locations.find((l) => l.id === connId);
            if (!target) return null;
            const isBlocked = loc.isBlocked || target.isBlocked;
            return (
              <line
                key={`${loc.id}_${connId}`}
                x1={loc.x}
                y1={loc.y}
                x2={target.x}
                y2={target.y}
                stroke={isBlocked ? '#fca5a5' : '#cbd5e1'}
                strokeWidth={isBlocked ? '0.8' : '0.6'}
                strokeDasharray={isBlocked ? '2,2' : 'none'}
              />
            );
          })
        )}

        {/* 被切断的道路（张扬【断路】）- 绘制红× */}
        {cutConnections.map((cut, idx) => {
          const locA = locations.find((l) => l.id === cut.locA);
          const locB = locations.find((l) => l.id === cut.locB);
          if (!locA || !locB) return null;
          const midX = (locA.x + locB.x) / 2;
          const midY = (locA.y + locB.y) / 2;
          const angle = Math.atan2(locB.y - locA.y, locB.x - locA.x);
          const size = 2.5;
          const x1 = midX - size * Math.cos(angle + Math.PI / 4);
          const y1 = midY - size * Math.sin(angle + Math.PI / 4);
          const x2 = midX + size * Math.cos(angle + Math.PI / 4);
          const y2 = midY + size * Math.sin(angle + Math.PI / 4);
          const x3 = midX - size * Math.cos(angle - Math.PI / 4);
          const y3 = midY - size * Math.sin(angle - Math.PI / 4);
          const x4 = midX + size * Math.cos(angle - Math.PI / 4);
          const y4 = midY + size * Math.sin(angle - Math.PI / 4);
          return (
            <g key={`cut_${idx}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round" />
              <line x1={x3} y1={y3} x2={x4} y2={y4} stroke="#dc2626" strokeWidth="1.2" strokeLinecap="round" />
            </g>
          );
        })}

        {/* 地点 */}
        {locations.map((loc, locIndex) => {
          const alivePlayers = getAlivePlayers(loc.id);
          const allPlayersHere = getAllPlayers(loc.id);
          const deadPlayersHere = allPlayersHere.filter((p) => p.status === 'dead');
          const isBlocked = loc.isBlocked;
          const locNum = locIndex + 1;

          return (
            <g key={loc.id}>
              <circle
                cx={loc.x}
                cy={loc.y}
                r={5}
                fill={isBlocked ? '#ef4444' : '#64748b'}
                opacity={isBlocked ? '0.6' : '0.9'}
                stroke="white"
                strokeWidth="1"
              />
              <text
                x={loc.x}
                y={loc.y + 1.2}
                textAnchor="middle"
                fontSize="4.5"
                fill="white"
                fontWeight="bold"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {locNum}
              </text>
              <text
                x={loc.x}
                y={loc.y + 10}
                textAnchor="middle"
                fontSize="3.2"
                fill={isBlocked ? '#ef4444' : '#334155'}
                fontWeight={allPlayersHere.length > 0 ? '700' : '500'}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {loc.name}
              </text>
              {/* 地点效果标记 */}
              {loc.effect && loc.effect.type !== 'placeholder' && (
                <text
                  x={loc.x}
                  y={loc.y + 13.5}
                  textAnchor="middle"
                  fontSize="2.6"
                  fill="#d97706"
                  fontWeight="600"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {loc.effect.name}
                </text>
              )}

              {/* 存活玩家 - 正常显示 */}
              {alivePlayers.map((p, i) => {
                const playerIndex = players.filter((pl) => pl.status === 'alive').indexOf(p) + 1;
                const angle = (2 * Math.PI * i) / Math.max(alivePlayers.length + deadPlayersHere.length, 1) - Math.PI / 2;
                const offset = 8;
                const px = loc.x + Math.cos(angle) * offset;
                const py = loc.y + Math.sin(angle) * offset;
                return (
                  <g key={p.id}>
                    <circle
                      cx={px}
                      cy={py}
                      r={3}
                      fill={getPlayerColor(p.identity)}
                      stroke="white"
                      strokeWidth="0.5"
                    />
                    <text
                      x={px}
                      y={py + 1}
                      textAnchor="middle"
                      fontSize="3"
                      fill="white"
                      fontWeight="bold"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {playerIndex}
                    </text>
                  </g>
                );
              })}

              {/* 尸体 - 红色半透明 × 标记 */}
              {deadPlayersHere.map((p, i) => {
                const angle = (2 * Math.PI * (alivePlayers.length + i)) / Math.max(alivePlayers.length + deadPlayersHere.length, 1) - Math.PI / 2;
                const offset = 8;
                const px = loc.x + Math.cos(angle) * offset;
                const py = loc.y + Math.sin(angle) * offset;
                return (
                  <g key={p.id}>
                    <circle
                      cx={px}
                      cy={py}
                      r={3}
                      fill={getIdentityColor(p.identity)}
                      opacity="0.5"
                      stroke="#dc2626"
                      strokeWidth="0.5"
                    />
                    <text
                      x={px}
                      y={py + 1}
                      textAnchor="middle"
                      fontSize="3"
                      fill="#7f1d1d"
                      fontWeight="bold"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      ×
                    </text>
                  </g>
                );
              })}

              {allPlayersHere.length > 0 && (
                <text
                  x={loc.x + 6.5}
                  y={loc.y - 5}
                  textAnchor="middle"
                  fontSize="3"
                  fill="#2563eb"
                  fontWeight="bold"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {allPlayersHere.length}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* 图例 */}
      <div className="absolute bottom-2 left-2 bg-white/95 backdrop-blur rounded-md px-3 py-2 shadow-sm border text-xs space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="w-4 h-4 rounded-full bg-slate-500 flex items-center justify-center text-white text-xs font-bold">N</span>
          <span>地点编号</span>
        </div>
        {showKillers ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <span>平民</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
              <span>杀手</span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
            <span>存活</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 opacity-50" />
          <span>尸体</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span>封锁</span>
        </div>
      </div>
    </div>
  );
}
