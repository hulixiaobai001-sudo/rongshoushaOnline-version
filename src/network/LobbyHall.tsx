import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Plus, ArrowLeft, Search, Wifi } from 'lucide-react'

interface LobbyHallProps {
  onCreateRoom: () => void
  onBack: () => void
}

export function LobbyHall({ onCreateRoom, onBack }: LobbyHallProps) {
  return (
    <div className="h-screen flex flex-col bg-slate-900">
      {/* 顶部 */}
      <header className="px-3 md:px-4 py-3 border-b border-slate-700 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}
          className="h-8 px-2 text-slate-300 hover:text-white hover:bg-slate-800">
          <ArrowLeft className="w-4 h-4 mr-1" />返回
        </Button>
        <div className="flex-1" />
        <Button onClick={onCreateRoom} size="sm" className="bg-indigo-600 hover:bg-indigo-700 h-8 text-xs">
          <Plus className="w-3.5 h-3.5 mr-1" />创建房间
        </Button>
      </header>

      {/* 搜索框占位 */}
      <div className="px-3 md:px-4 py-3">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <Input placeholder="搜索房间..." disabled
            className="pl-9 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500 opacity-50" />
        </div>
      </div>

      {/* 房间列表 - 空壳 */}
      <main className="flex-1 overflow-auto px-3 md:px-4 pb-4">
        <div className="max-w-2xl mx-auto">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="p-8 text-center">
              <Wifi className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-medium text-slate-400 mb-1">暂无公开房间</h3>
              <p className="text-sm text-slate-600">
                联机大厅功能开发中，敬请期待
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
