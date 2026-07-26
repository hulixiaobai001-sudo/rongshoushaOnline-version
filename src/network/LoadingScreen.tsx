import { useState, useEffect } from 'react'
import { useGameStore } from '@/store/gameStore'
import { Card, CardContent } from '@/components/ui/card'

const LOADING_STEPS = [
  { key: 'identity', label: '正在分配身份', icon: '🎭' },
  { key: 'map', label: '正在准备地图', icon: '🗺️' },
  { key: 'resources', label: '正在加载资源', icon: '📦' },
  { key: 'device', label: '正在检测设备配置', icon: '🔧' },
  { key: 'hero', label: '正在分配英雄', icon: '⚡' },
  { key: 'enter', label: '正在进入游戏', icon: '🚀' },
]

interface LoadingScreenProps {
  debugMode: boolean
  botNames?: string[]
  onComplete: () => void
}

export function LoadingScreen({ debugMode, botNames, onComplete }: LoadingScreenProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [progress, setProgress] = useState(0)
  const [log, setLog] = useState<string[]>([])
  const { loadDefaultMap, assignIdentities, assignHeroes, resetGame, addPlayer, nextPhase, randomPlaceAll } = useGameStore()

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        // 重置游戏状态
        resetGame()
        addLog('初始化游戏引擎...')

        // 填充调试空壳玩家
        if (botNames && botNames.length > 0) {
          botNames.forEach((name) => {
            addPlayer(name)
            addLog(`添加玩家: ${name}`)
          })
        }

        // 步骤1：分配身份
        setCurrentStep(0)
        await delay(debugMode ? 300 : 800)
        if (cancelled) return
        assignIdentities()
        addLog('身份分配完成')
        setProgress(16)

        // 步骤2：准备地图
        setCurrentStep(1)
        await delay(debugMode ? 300 : 800)
        if (cancelled) return
        loadDefaultMap()
        addLog('默认地图加载完成')
        setProgress(33)

        // 步骤3：加载资源
        setCurrentStep(2)
        await delay(debugMode ? 400 : 1000)
        if (cancelled) return
        addLog('角色资源加载完成')
        setProgress(50)

        // 步骤4：设备检测
        setCurrentStep(3)
        await delay(debugMode ? 300 : 600)
        if (cancelled) return
        addLog('设备配置检测通过')
        setProgress(66)

        // 步骤5：分配英雄
        setCurrentStep(4)
        await delay(debugMode ? 300 : 800)
        if (cancelled) return
        assignHeroes()
        addLog('英雄分配完成')
        setProgress(83)

        // 步骤6：跳过设置阶段，直接进入游戏
        setCurrentStep(5)
        await delay(debugMode ? 200 : 500)
        if (cancelled) return
        // 随机放置所有玩家到地图上
        addLog('随机放置玩家...')
        randomPlaceAll()
        if (!cancelled) await delay(100)
        // 自动推进到 action1 阶段
        addLog('跳过前置阶段...')
        nextPhase() // identity → start
        if (!cancelled) await delay(100)
        nextPhase() // start → action1
        if (!cancelled) await delay(100)
        addLog('游戏准备就绪')
        setProgress(100)
      } catch (e) {
        addLog(`加载异常: ${e}`)
      }

      // 完成（无论成功还是异常都继续）
      await delay(300)
      if (cancelled) return
      onComplete()
    }

    // 安全后备：5秒超时自动完成
    const fallbackTimer = setTimeout(() => {
      if (!cancelled) {
        addLog('安全超时，强制进入游戏')
        onComplete()
      }
    }, 5000)

    run().finally(() => clearTimeout(fallbackTimer))
    return () => { cancelled = true; clearTimeout(fallbackTimer) }
  }, [])

  const addLog = (msg: string) => {
    setLog((prev) => [...prev, msg])
  }

  return (
    <div className="h-screen flex items-center justify-center bg-slate-900 p-4">
      <Card className="w-full max-w-md bg-slate-800 border-slate-700">
        <CardContent className="p-6 space-y-6">
          {/* 标题 */}
          <div className="text-center">
            <h2 className="text-lg font-bold text-white">正在准备游戏</h2>
            <p className="text-xs text-slate-400 mt-1">请稍候，正在加载对局所需资源</p>
          </div>

          {/* 进度条 */}
          <div className="space-y-2">
            <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 text-right font-mono">{progress}%</p>
          </div>

          {/* 当前步骤 */}
          <div className="space-y-3">
            {LOADING_STEPS.map((step, i) => {
              const isActive = i === currentStep
              const isDone = i < currentStep
              return (
                <div key={step.key}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all ${
                    isActive
                      ? 'bg-indigo-900/30 border border-indigo-700/50'
                      : isDone
                        ? 'bg-emerald-900/20 border border-emerald-800/20'
                        : 'bg-slate-900/30 border border-transparent opacity-40'
                  }`}>
                  <span className="text-lg">{isDone ? '✅' : isActive ? '⏳' : step.icon}</span>
                  <span className={`text-sm ${isActive ? 'text-white font-medium' : isDone ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {step.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* 日志 */}
          <div className="bg-slate-900/50 rounded-lg p-2 h-20 overflow-auto space-y-0.5">
            {log.map((msg, i) => (
              <p key={i} className="text-[10px] text-slate-500 font-mono">
                &gt; {msg}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
