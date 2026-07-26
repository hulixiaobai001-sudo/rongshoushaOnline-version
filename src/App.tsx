import { useState } from 'react';
import { LobbyHall } from '@/network/LobbyHall';
import { Lobby } from '@/network/Lobby';
import { Button } from '@/components/ui/button';
import { Wifi } from 'lucide-react';

type AppMode = 'menu' | 'online_hall' | 'online_host' | 'online_player';

function App() {
  const [appMode, setAppMode] = useState<AppMode>('menu');

  if (appMode === 'menu') {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-sm space-y-4">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🦊</div>
            <h1 className="text-3xl font-bold text-white">绒兽杀</h1>
            <p className="text-sm text-slate-400 mt-2">在线版 · P2P 直连</p>
          </div>

          <Button
            onClick={() => setAppMode('online_hall')}
            className="w-full h-14 text-base bg-indigo-600 hover:bg-indigo-700"
          >
            <Wifi className="w-5 h-5 mr-3" />
            联机模式
          </Button>

          <div className="text-center text-[10px] text-slate-600 mt-4">
            通过 WiFi P2P 直连，无需服务器 · 开发中
          </div>
        </div>
      </div>
    );
  }

  if (appMode === 'online_hall') {
    return <LobbyHall onCreateRoom={() => setAppMode('online_host')} onBack={() => setAppMode('menu')} />;
  }

  if (appMode === 'online_host' || appMode === 'online_player') {
    return <Lobby onBack={() => setAppMode('online_hall')} />;
  }

  return null;
}

export default App;
