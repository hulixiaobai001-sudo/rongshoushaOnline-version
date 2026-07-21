import { useGameStore } from '@/store/gameStore';
import { getIdentityColor, getIdentityName } from '@/types/game';
import { getHeroById } from '@/data/heroData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, RotateCcw, Users, Skull, Heart, Crown, MapPin } from 'lucide-react';

export function GameEnd() {
  const { players, locations, winner, events, round, resetGame } = useGameStore();

  const alivePlayers = players.filter((p) => p.status === 'alive');
  const deadPlayers = players.filter((p) => p.status === 'dead');

  const isGoodWin = winner === 'good';
  const winColor = isGoodWin ? '#2563eb' : '#dc2626';
  const winBg = isGoodWin ? 'bg-blue-50' : 'bg-red-50';
  const winBorder = isGoodWin ? 'border-blue-200' : 'border-red-200';

  return (
    <div className="h-screen flex flex-col bg-slate-900 overflow-auto">
      {/* 头部 */}
      <header className="px-6 py-6 text-center border-b border-slate-700">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Trophy className="w-8 h-8" style={{ color: winColor }} />
          <h1 className="text-3xl font-bold text-white">游戏结束</h1>
        </div>
        <p className="text-slate-400">共进行 {round} 轮</p>
      </header>

      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* 胜利方 */}
          <div className={`rounded-xl border ${winBg} ${winBorder} p-6 text-center`}>
            <Crown className="w-16 h-16 mx-auto mb-3" style={{ color: winColor }} />
            <h2 className="text-2xl font-bold mb-2" style={{ color: winColor }}>
              {isGoodWin ? '好人阵营胜利！' : '杀手阵营胜利！'}
            </h2>
            <p className="text-slate-600">
              {isGoodWin
                ? '所有杀手已被消灭，正义得到了伸张。'
                : '杀手成功控制了局势，黑暗笼罩了一切。'}
            </p>
          </div>

          {/* 存活角色 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Heart className="w-5 h-5 text-green-600" />
                存活角色（{alivePlayers.length}）
                <Badge variant="outline" className="ml-auto text-xs">
                  胜利方
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {alivePlayers.map((player) => {
                  const hero = player.heroId ? getHeroById(player.heroId) : null;
                  const color = getIdentityColor(player.identity);

                  return (
                    <div
                      key={player.id}
                      className="flex items-center gap-2 p-2 rounded-lg border bg-white"
                    >
                      {hero && (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{
                            backgroundColor: hero.color + '20',
                            color: hero.color,
                            border: `2px solid ${hero.color}60`,
                          }}
                        >
                          {hero.name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{player.name}</p>
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Badge variant="outline" className="text-xs px-1 py-0 h-4" style={{ borderColor: color + '60', color }}>
                            {getIdentityName(player.identity)}
                          </Badge>
                          {hero && (
                            <span style={{ color: hero.color }}>{hero.name}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 死亡角色 */}
          {deadPlayers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Skull className="w-5 h-5 text-red-600" />
                  死亡角色（{deadPlayers.length}）
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {deadPlayers.map((player) => {
                    const hero = player.heroId ? getHeroById(player.heroId) : null;
                    const loc = locations.find((l) => l.id === player.locationId);
                    const color = getIdentityColor(player.identity);

                    return (
                      <div
                        key={player.id}
                        className="flex items-center gap-2 p-2 rounded-lg border bg-red-50 border-red-100 opacity-70"
                      >
                        {hero && (
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{
                              backgroundColor: hero.color + '10',
                              color: hero.color,
                              border: `2px solid ${hero.color}30`,
                            }}
                          >
                            {hero.name.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate line-through">{player.name}</p>
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Badge variant="outline" className="text-xs px-1 py-0 h-4" style={{ borderColor: color + '40', color }}>
                              {getIdentityName(player.identity)}
                            </Badge>
                            {loc && (
                              <span className="flex items-center gap-0.5">
                                <MapPin className="w-3 h-3" />
                                {loc.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 事件摘要 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-5 h-5 text-slate-600" />
                游戏日志
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-48 overflow-auto">
                {events.filter((e) => e.type === 'death' || e.type === 'win' || e.type === 'settlement').map((event) => (
                  <div
                    key={event.id}
                    className={`text-sm px-2 py-1 rounded ${
                      event.type === 'win'
                        ? 'bg-amber-50 text-amber-800 font-medium'
                        : event.type === 'death'
                          ? 'bg-red-50 text-red-700'
                          : 'text-slate-600'
                    }`}
                  >
                    第{event.round}轮 · {event.description}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 重新开始 */}
          <div className="text-center pb-6">
            <Button onClick={resetGame} size="lg" className="font-semibold">
              <RotateCcw className="w-5 h-5 mr-2" />
              重新开始
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
