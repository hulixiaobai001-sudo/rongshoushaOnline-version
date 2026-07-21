import { useGameStore } from '@/store/gameStore';
import { getIdentityColor, getIdentityName } from '@/types/game';
import { getHeroById } from '@/data/heroData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skull, ChevronRight, Heart, Shield, Swords, Users, SwordsIcon } from 'lucide-react';

export function SettlementPhase() {
  const { round, players, locations, nextPhase, pendingAttacks, kungFuActivePlayers } = useGameStore();

  // alive/dead stats are shown via inline filters in JSX

  // 获取攻击的详细信息
  const attackDetails = pendingAttacks.map((attack) => {
    const attacker = players.find((p) => p.id === attack.attackerId);
    const target = players.find((p) => p.id === attack.targetId);
    const targetLoc = locations.find((l) => l.id === target?.locationId);
    const hasKungFu = target ? kungFuActivePlayers.includes(target.id) : false;
    return { attacker, target, targetLoc, hasKungFu };
  });

  const hasAttacks = attackDetails.length > 0;

  const handleContinue = () => {
    nextPhase();
  };

  return (
    <div className="h-full flex flex-col gap-3">
      {/* 顶部状态栏 */}
      <div className="flex items-center gap-3 bg-white rounded-lg border px-4 py-3">
        <Badge variant="secondary" className="text-sm font-mono">第 {round} 轮</Badge>
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Skull className="w-5 h-5 text-red-600" />
          结算阶段
        </h2>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
        {/* 左侧：攻击事件 */}
        <Card className="flex-1 flex flex-col min-h-0">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Swords className="w-4 h-4 text-red-600" />
              {hasAttacks ? '待结算攻击' : '本回合无攻击'}
              {hasAttacks && (
                <Badge variant="destructive" className="ml-auto text-xs">
                  {attackDetails.length} 次
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            {hasAttacks ? (
              <div className="space-y-3">
                {attackDetails.map((detail, index) => {
                  if (!detail.attacker || !detail.target) return null;
                  const attackerHero = detail.attacker.heroId ? getHeroById(detail.attacker.heroId) : null;
                  const targetHero = detail.target.heroId ? getHeroById(detail.target.heroId) : null;
                  const attackerColor = getIdentityColor(detail.attacker.identity);
                  const targetColor = getIdentityColor(detail.target.identity);

                  return (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${
                        detail.hasKungFu
                          ? 'bg-amber-50 border-amber-300'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {/* 攻击者 */}
                        <div className="flex items-center gap-1.5">
                          {attackerHero && (
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                              style={{
                                backgroundColor: attackerHero.color + '20',
                                color: attackerHero.color,
                                border: `2px solid ${attackerHero.color}60`,
                              }}
                            >
                              {attackerHero.name.charAt(0)}
                            </div>
                          )}
                          <span className="font-bold text-sm" style={{ color: attackerColor }}>
                            {detail.attacker.name}
                          </span>
                          <Badge variant="outline" className="text-xs" style={{ borderColor: attackerColor, color: attackerColor }}>
                            {getIdentityName(detail.attacker.identity)}
                          </Badge>
                        </div>

                        <SwordsIcon className="w-4 h-4 text-slate-400 shrink-0" />

                        {/* 目标 */}
                        <div className="flex items-center gap-1.5">
                          {targetHero && (
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                              style={{
                                backgroundColor: targetHero.color + '20',
                                color: targetHero.color,
                                border: `2px solid ${targetHero.color}60`,
                              }}
                            >
                              {targetHero.name.charAt(0)}
                            </div>
                          )}
                          <span className="font-bold text-sm" style={{ color: targetColor }}>
                            {detail.target.name}
                          </span>
                          <Badge variant="outline" className="text-xs" style={{ borderColor: targetColor, color: targetColor }}>
                            {getIdentityName(detail.target.identity)}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                        <span>{detail.targetLoc ? detail.targetLoc.name : '未知地点'}</span>
                        {detail.hasKungFu && (
                          <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                            <Shield className="w-3 h-3 mr-0.5" />
                            【功夫】攻击者将被反弹
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400">
                <Heart className="w-12 h-12 mb-3 text-green-400" />
                <p className="text-sm">本回合无攻击事件</p>
                <p className="text-xs text-slate-400 mt-1">所有角色平安</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 右侧：存活统计 */}
        <Card className="w-full lg:w-72 shrink-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-green-600" />
              存活统计
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-red-600 font-medium">杀手</span>
                  <span className="font-mono font-bold">
                    {players.filter((p) => p.status === 'alive' && p.identity === 'killer').length}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: '100%' }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-blue-600 font-medium">平民</span>
                  <span className="font-mono font-bold">
                    {players.filter((p) => p.status === 'alive' && p.identity === 'civilian').length}
                  </span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: '100%' }} />
                </div>
              </div>
              {kungFuActivePlayers.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-2">
                  <p className="text-xs text-amber-700 font-medium">
                    <Shield className="w-3 h-3 inline mr-1" />
                    功夫激活中：{kungFuActivePlayers.length} 人
                  </p>
                </div>
              )}
              <div className="text-xs text-slate-500 bg-slate-50 rounded-md p-2 space-y-1">
                <p>有功夫 → 攻击者死亡（反弹）</p>
                <p>无功夫 → 目标死亡</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 底部确认 */}
      <Button onClick={handleContinue} className="font-semibold bg-red-600 hover:bg-red-700" size="sm">
        {hasAttacks ? '结算所有攻击' : '无事发生，继续'}
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );
}
