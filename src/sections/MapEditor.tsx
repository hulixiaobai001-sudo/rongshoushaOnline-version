import { useState, useRef, useCallback } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Map,
  Trash2,
  MousePointer,
  Link,
  Unlink,
  Check,
  RotateCcw,
  AlertCircle,
  Dice5,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const MAP_W = 100;
const MAP_H = 100;

export function MapEditor() {
  const {
    tempLocations,
    locations,
    addLocation,
    removeLocation,
    updateLocationName,
    moveLocation,
    toggleConnection,
    removeConnection,
    commitMap,
    loadDefaultMap,
    generateRandomMap,
  } = useGameStore();

  const [mode, setMode] = useState<'select' | 'connect'>('select');
  const [selectedLoc, setSelectedLoc] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // 获取SVG坐标
  const getSvgCoords = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * MAP_W,
        y: ((e.clientY - rect.top) / rect.height) * MAP_H,
      };
    },
    []
  );

  // 点击SVG
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging) return;
    if (e.target === svgRef.current) {
      // 点击空白处：添加地点
      if (mode === 'select') {
        const { x, y } = getSvgCoords(e);
        // 确保不重叠
        const name = `地点${tempLocations.length + 1}`;
        addLocation(name, Math.round(x * 10) / 10, Math.round(y * 10) / 10);
        setSelectedLoc(null);
        setConnectingFrom(null);
      } else {
        setMode('select');
        setConnectingFrom(null);
      }
    }
  };

  // 点击地点
  const handleLocClick = (locId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (mode === 'connect') {
      if (!connectingFrom) {
        setConnectingFrom(locId);
      } else if (connectingFrom === locId) {
        setConnectingFrom(null);
      } else {
        toggleConnection(connectingFrom, locId);
        setConnectingFrom(null);
        setMode('select');
      }
      return;
    }

    setSelectedLoc(selectedLoc === locId ? null : locId);
  };

  // 拖拽地点
  const handleMouseDown = (locId: string, e: React.MouseEvent) => {
    if (mode !== 'select') return;
    e.stopPropagation();
    setIsDragging(false);

    const handleMouseMove = (moveE: MouseEvent) => {
      setIsDragging(true);
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = ((moveE.clientX - rect.left) / rect.width) * MAP_W;
      const y = ((moveE.clientY - rect.top) / rect.height) * MAP_H;
      moveLocation(locId, Math.max(5, Math.min(95, x)), Math.max(5, Math.min(95, y)));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setTimeout(() => setIsDragging(false), 50);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="h-full flex flex-col lg:flex-row gap-4">
      {/* 地图区域 */}
      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader className="pb-2 shrink-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Map className="w-5 h-5 text-emerald-600" />
            地图编辑
            <div className="ml-auto flex items-center gap-1.5">
              <Badge variant="outline" className="text-xs">
                {tempLocations.length} 个地点
              </Badge>
              <Badge
                variant={mode === 'select' ? 'default' : 'outline'}
                className="text-xs cursor-pointer"
                onClick={() => {
                  setMode('select');
                  setConnectingFrom(null);
                }}
              >
                <MousePointer className="w-3 h-3 mr-1" />
                选择
              </Badge>
              <Badge
                variant={mode === 'connect' ? 'default' : 'outline'}
                className="text-xs cursor-pointer"
                onClick={() => {
                  setMode('connect');
                  setConnectingFrom(null);
                  setSelectedLoc(null);
                }}
              >
                <Link className="w-3 h-3 mr-1" />
                连线
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-2 relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            className="w-full h-full bg-slate-50 rounded-lg border"
            onClick={handleSvgClick}
            style={{ cursor: mode === 'select' ? 'crosshair' : 'pointer' }}
          >
            {/* 网格 */}
            {Array.from({ length: 9 }, (_, i) => (
              <g key={i} opacity="0.06">
                <line
                  x1={0}
                  y1={(i + 1) * 10}
                  x2={MAP_W}
                  y2={(i + 1) * 10}
                  stroke="#000"
                  strokeWidth="0.3"
                />
                <line
                  x1={(i + 1) * 10}
                  y1={0}
                  x2={(i + 1) * 10}
                  y2={MAP_H}
                  stroke="#000"
                  strokeWidth="0.3"
                />
              </g>
            ))}

            {/* 连线 */}
            {tempLocations.map((loc) =>
              loc.connectedTo.map((connId) => {
                if (connId <= loc.id) return null;
                const target = tempLocations.find((l) => l.id === connId);
                if (!target) return null;
                const isSelected =
                  selectedLoc === loc.id ||
                  selectedLoc === connId ||
                  (connectingFrom === loc.id && !target.connectedTo.includes(loc.id));
                return (
                  <line
                    key={`${loc.id}_${connId}`}
                    x1={loc.x}
                    y1={loc.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={isSelected ? '#10b981' : '#94a3b8'}
                    strokeWidth={isSelected ? '1.2' : '0.8'}
                    opacity={isSelected ? '0.9' : '0.5'}
                  />
                );
              })
            )}

            {/* 临时连线提示 */}
            {connectingFrom && (
              <>
                {(() => {
                  const from = tempLocations.find((l) => l.id === connectingFrom);
                  if (!from) return null;
                  return tempLocations
                    .filter(
                      (l) =>
                        l.id !== connectingFrom && !from.connectedTo.includes(l.id)
                    )
                    .map((l) => (
                      <line
                        key={`tmp_${l.id}`}
                        x1={from.x}
                        y1={from.y}
                        x2={l.x}
                        y2={l.y}
                        stroke="#10b981"
                        strokeWidth="0.6"
                        strokeDasharray="2,2"
                        opacity="0.4"
                      />
                    ));
                })()}
              </>
            )}

            {/* 地点节点 */}
            {tempLocations.map((loc) => {
              const isSelected = selectedLoc === loc.id;
              const isConnectingFrom = connectingFrom === loc.id;
              const hasConnections = loc.connectedTo.length > 0;

              return (
                <g
                  key={loc.id}
                  onClick={(e) => handleLocClick(loc.id, e)}
                  onMouseDown={(e) => handleMouseDown(loc.id, e)}
                  style={{ cursor: mode === 'select' ? 'move' : 'pointer' }}
                >
                  {/* 选中高亮 */}
                  {(isSelected || isConnectingFrom) && (
                    <circle
                      cx={loc.x}
                      cy={loc.y}
                      r={6}
                      fill="none"
                      stroke={isConnectingFrom ? '#10b981' : '#3b82f6'}
                      strokeWidth="1"
                      opacity="0.5"
                    />
                  )}

                  {/* 主圆 */}
                  <circle
                    cx={loc.x}
                    cy={loc.y}
                    r={4}
                    fill={
                      isConnectingFrom
                        ? '#10b981'
                        : isSelected
                          ? '#3b82f6'
                          : hasConnections
                            ? '#475569'
                            : '#94a3b8'
                    }
                    stroke="white"
                    strokeWidth="1"
                  />

                  {/* 名称 */}
                  <text
                    x={loc.x}
                    y={loc.y + 8}
                    textAnchor="middle"
                    fontSize="3.2"
                    fill={isSelected ? '#1e40af' : '#334155'}
                    fontWeight={isSelected ? '700' : '500'}
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {loc.name}
                  </text>

                  {/* 连接数 */}
                  {loc.connectedTo.length > 0 && (
                    <text
                      x={loc.x}
                      y={loc.y + 1.2}
                      textAnchor="middle"
                      fontSize="3"
                      fill="white"
                      fontWeight="bold"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {loc.connectedTo.length}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* 模式提示 */}
          <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur rounded-md px-3 py-1.5 shadow-sm border text-xs flex items-center gap-2">
            {mode === 'select' ? (
              <>
                <MousePointer className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-slate-600">点击空白添加地点 · 拖动移动 · 点击选中</span>
              </>
            ) : (
              <>
                <Link className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-slate-600">
                  {connectingFrom
                    ? '选择目标地点建立连线'
                    : '选择起始地点'}
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 右侧面板 */}
      <div className="w-full lg:w-72 shrink-0 space-y-3 flex flex-col">
        {/* 地点列表 */}
        <Card className="flex-1 min-h-0 flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">地点列表</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 p-0">
            <ScrollArea className="h-full px-4 pb-4">
              {tempLocations.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>在左侧地图上</p>
                  <p>点击空白处添加地点</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tempLocations.map((loc) => {
                    const isSelected = selectedLoc === loc.id;
                    return (
                      <div
                        key={loc.id}
                        className={`p-2.5 rounded-md border transition-colors ${
                          isSelected
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-slate-50 border-transparent hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-3 h-3 rounded-full shrink-0 ${
                              loc.connectedTo.length > 0 ? 'bg-slate-600' : 'bg-slate-300'
                            }`}
                          />
                          <Input
                            value={loc.name}
                            onChange={(e) => updateLocationName(loc.id, e.target.value)}
                            className="flex-1 h-7 text-sm"
                            onClick={() => setSelectedLoc(loc.id)}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              removeLocation(loc.id);
                              if (selectedLoc === loc.id) setSelectedLoc(null);
                            }}
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>

                        {/* 连接信息 */}
                        {loc.connectedTo.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5 ml-5">
                            {loc.connectedTo.map((connId) => {
                              const conn = tempLocations.find((l) => l.id === connId);
                              return conn ? (
                                <Badge
                                  key={connId}
                                  variant="outline"
                                  className="text-xs px-1.5 py-0 h-5 cursor-pointer hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                                  onClick={() => removeConnection(loc.id, connId)}
                                  title="点击删除连线"
                                >
                                  <Unlink className="w-2.5 h-2.5 mr-0.5" />
                                  {conn.name}
                                </Badge>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* 操作按钮 */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={loadDefaultMap} className="text-sm" size="sm">
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            加载示例
          </Button>
          <Button
            variant="outline"
            onClick={generateRandomMap}
            className="text-sm border-indigo-300 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800"
            size="sm"
          >
            <Dice5 className="w-3.5 h-3.5 mr-1.5" />
            随机生成
          </Button>
          <Button onClick={commitMap} className="col-span-2 text-sm" size="sm" variant="default">
            <Check className="w-3.5 h-3.5 mr-1.5" />
            保存地图
          </Button>
        </div>

        {locations.length > 0 && (
          <Alert className="bg-emerald-50 border-emerald-200 text-xs py-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <AlertDescription className="text-emerald-700">
              地图已保存，共 {locations.length} 个地点
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
