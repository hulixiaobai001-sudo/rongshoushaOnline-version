import { useGameStore } from '@/store/gameStore';
import { getIdentityColor, getIdentityName } from '@/types/game';
import { getHeroById } from '@/data/heroData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skull, MapPin, Lock, ChevronRight, Heart, Users } from 'lucide-react';

export function DeathReport() {
  const { round, players, locations, nextPhase } = useGameStore();

  // 本轮死亡角色（dead 状态但地点未封锁的）
  const deadThisRound = players.filter((p) => {
    if (p.status !== 'dead') return false;
    const loc = locations.find((l) => l.id === p.locationId);
    return loc && !loc.isBlocked;
  });

  // 历史死亡角色（dead 状态且地点已封锁的）
  const deadPreviousRounds = players.filter((p) => {
    if (p.status !== 'dead') return false;
    const loc = locations.find((l) => l.id === p.locationId);
    return loc && loc.isBlocked;
  });

  const alivePlayers = players.filter((p) => p.status === 'alive');

  return (
    <div className="h-full flex flex-col gap-3">
      {/* 顶部 */}
      <div className="flex items-center gap-3 bg-white rounded-lg border px-4 py-3">
        <Badge variant="secondary" className="text-sm font-mono">第 {round} 轮</Badge>
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Skull className="w-5 h-5 text-red-600" />
          死亡播报
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
            <Heart className="w-3 h-3 mr-1" />
            存活 {alivePlayers.length}
          </Badge>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
        {/* 左侧：本轮死亡 */}
        <Card className="flex-1 flex flex-col min-h-0">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Skull className="w-4 h-4 text-red-600" />
              本轮死亡角色
              {deadThisRound.length > 0 && (
                <Badge variant="destructive" className="ml-auto text-xs">
                  {deadThisRound.length} 人
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            {deadThisRound.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400">
                <Heart className="w-12 h-12 mb-3 text-green-400" />
                <p className="text-sm">本轮无人死亡</p>
                <p className="text-xs text-slate-400 mt-1">所有角色平安度过</p>
              </div>
            ) : (
              <div className="space-y-3">
                {deadThisRound.map((player) => {
                  const hero = player.heroId ? getHeroById(player.heroId) : null;
                  const loc = locations.find((l) => l.id === player.locationId);
                  const color = getIdentityColor(player.identity);

                  return (
                    <div
                      key={player.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-200"
                    >
                      {/* 英雄头像占位 */}
                      {hero && (
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold shrink-0"
                          style={{
                            backgroundColor: hero.color + '20',
                            color: hero.color,
                            border: `2px solid ${hero.color}60`,
                          }}
                        >
                          {hero.name.charAt(0)}
                        </div>
                      )}

                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 line-through">{player.name}</span>
                          {hero && (
                            <Badge variant="outline" className="text-xs" style={{ borderColor: hero.color + '60', color: hero.color }}>
                              {hero.name}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs" style={{ borderColor: color, color }}>
                            {getIdentityName(player.identity)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                          <MapPin className="w-3 h-3" />
                          <span>{loc ? loc.name : '未知地点'}</span>
                          <Lock className="w-3 h-3 text-red-500" />
                          <span className="text-red-600 font-medium">将被封锁</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 右侧：历史死亡 + 存活 */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-3">
          {/* 历史死亡 */}
          {deadPreviousRounds.length > 0 && (
            <Card className="flex-1 min-h-0 flex flex-col">
              <CardHeader className="pb-2 shrink-0">
                <CardTitle className="flex items-center gap-2 text-sm text-slate-500">
                  <Lock className="w-4 h-4" />
                  已封锁地点（历史）
                  <Badge variant="outline" className="ml-auto text-xs">
                    {deadPreviousRounds.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-auto">
                <div className="space-y-2">
                  {deadPreviousRounds.map((player) => {
                    const loc = locations.find((l) => l.id === player.locationId);
                    return (
                      <div key={player.id} className="flex items-center gap-2 text-sm text-slate-500">
                        <Lock className="w-3 h-3 text-red-400" />
                        <span className="line-through">{player.name}</span>
                        {loc && <span className="text-xs">{loc.name}</span>}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 存活角色 */}
          <Card className="shrink-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-green-600" />
                存活角色（{alivePlayers.length}）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {alivePlayers.map((p) => {
                  const hero = p.heroId ? getHeroById(p.heroId) : null;
                  return (
                    <Badge
                      key={p.id}
                      variant="outline"
                      className="text-xs"
                      style={hero ? { borderColor: hero.color + '40', color: hero.color } : {}}
                    >
                      {p.name}
                    </Badge>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 底部确认 */}
      <Button onClick={nextPhase} className="font-semibold bg-red-600 hover:bg-red-700" size="sm">
        <Lock className="w-4 h-4 mr-1.5" />
        确认封锁死亡地点，进入发言阶段
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );
}
