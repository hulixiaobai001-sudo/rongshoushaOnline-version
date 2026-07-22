import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Map, MessageSquare, ChevronUp, ChevronDown,
  Footprints, Swords, Zap, Eye, ArrowLeft
} from 'lucide-react'

interface OnlineGameProps {
  isHost: boolean
  onLeave: () => void
}

// ==================== 玩家游戏主界面（空壳） ====================

export function OnlineGame({ isHost, onLeave }: OnlineGameProps) {
  const [actionOpen, setActionOpen] = useState(false)

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-white">
      {/* 顶部状态栏 */}
      <header className="px-3 py-2 border-b border-slate-700 flex items-center gap-2 shrink-0 bg-slate-800/50">
        <Button variant="ghost" size="sm" onClick={onLeave}
          className="h-7 px-1.5 text-slate-400 hover:text-white hover:bg-slate-800 shrink-0">
          <ArrowLeft className="w-3.5 h-3.5" />
        </Button>
        <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-700">第 1 轮</Badge>
        <Badge className="text-[10px] bg-indigo-600">行动阶段</Badge>
        <div className="flex-1" />
        {isHost && <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-700">房主</Badge>}
      </header>

      {/* 主内容：地图 + 右侧面板 */}
      <main className="flex-1 flex flex-col lg:flex-row gap-2 p-2 min-h-0 overflow-hidden">
        {/* 左侧：大地图 */}
        <Card className="flex-1 flex flex-col min-h-[200px] bg-slate-800 border-slate-700">
          <CardContent className="flex-1 p-2 flex items-center justify-center">
            <div className="text-center">
              <Map className="w-12 h-12 text-slate-700 mx-auto mb-2" />
              <p className="text-xs text-slate-500">大地图（开发中）</p>
              <p className="text-[10px] text-slate-600 mt-1">侦查阶段将显示全图玩家位置</p>
            </div>
          </CardContent>
        </Card>

        {/* 右侧面板（手机端折叠到下面） */}
        <div className="w-full lg:w-72 shrink-0 flex flex-col gap-2">
          {/* 右上：小地图 + 日志 */}
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-slate-400 font-medium">📍 当前位置</span>
                <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-slate-600 text-slate-400">
                  侦查 · 行动 · 追踪
                </Badge>
              </div>
              <div className="bg-slate-900/50 rounded h-16 flex items-center justify-center mb-1">
                <p className="text-[10px] text-slate-600">小地图（附近节点）</p>
              </div>
              {/* 同地点玩家 */}
              <div className="flex flex-wrap gap-1">
                {['玩家A', '玩家B', '玩家C'].map((name) => (
                  <Badge key={name} variant="outline"
                    className="text-[9px] h-4 px-1 border-slate-600 text-slate-300">
                    {name}
                  </Badge>
                ))}
              </div>
              {/* 聊天按钮 */}
              <Button variant="ghost" size="sm" className="w-full mt-1 h-6 text-[10px] text-slate-400 hover:text-white">
                <MessageSquare className="w-3 h-3 mr-1" />区域聊天
              </Button>
            </CardContent>
          </Card>

          {/* 右下：角色信息 */}
          <Card className="bg-slate-800 border-slate-700 flex-1">
            <CardContent className="p-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold">房</div>
                <div>
                  <p className="text-xs font-medium text-white">房主（角色名）</p>
                  <p className="text-[9px] text-slate-500">称号占位</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {['技能A', '技能B'].map((skill) => (
                  <Button key={skill} variant="outline" size="sm"
                    className="h-6 text-[10px] px-2 border-slate-600 text-slate-300 hover:bg-slate-700"
                    title="长按查看技能介绍">
                    {skill}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* 底部操作拉取条 */}
      <div className="border-t border-slate-700 bg-slate-800/80">
        <Button variant="ghost" onClick={() => setActionOpen(!actionOpen)}
          className="w-full h-8 text-xs text-slate-300 hover:text-white rounded-none flex items-center justify-center gap-1">
          {actionOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          {actionOpen ? '收起行动面板' : '展开行动面板'}
        </Button>

        {actionOpen && (
          <div className="px-3 pb-3 space-y-2">
            <div className="grid grid-cols-4 gap-2">
              {[
                { icon: Footprints, label: '移动', desc: '移动到相邻地点' },
                { icon: Swords, label: '攻击', desc: '攻击同地点玩家（杀手）' },
                { icon: Zap, label: '技能', desc: '使用英雄技能' },
                { icon: Eye, label: '侦查', desc: '查看周围情况' },
              ].map((action) => (
                <Button key={action.label} variant="outline"
                  className="h-16 flex flex-col items-center justify-center gap-1 border-slate-600 hover:border-indigo-500 hover:bg-slate-700"
                  onClick={() => alert(`【${action.label}】${action.desc}\n\n二次确认：确定要执行此行动吗？`)}>
                  <action.icon className="w-5 h-5 text-slate-300" />
                  <span className="text-[10px] text-slate-400">{action.label}</span>
                </Button>
              ))}
            </div>

            {/* 移动示例弹窗 */}
            <div className="bg-slate-900/50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-slate-500">
                示例：移动 1号点 → 5号点
              </p>
              <p className="text-[9px] text-amber-500/70 mt-0.5">
                非行动阶段此按钮不可用
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
