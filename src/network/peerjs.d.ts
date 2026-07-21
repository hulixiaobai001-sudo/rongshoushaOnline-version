export function createRoom(): Promise<{ roomId: string; playerId: string; isHost: boolean }>
export function joinRoom(roomId: string): Promise<{ roomId: string; playerId: string; isHost: boolean }>
export function broadcast(data: Record<string, unknown>): void
export function sendAction(action: string, data?: Record<string, unknown>): void
export function sendCommand(command: string, data?: Record<string, unknown>, targetPeerId?: string | null): void
export function disconnect(): void
export function getState(): { isHost: boolean; roomId: string | null; myId: string | null; playerCount: number }
export function on(event: string, fn: (...args: unknown[]) => void): void

export const MSG: {
  PLAYER_MOVE: string
  PLAYER_ACTION: string
  PLAYER_VOTE: string
  PLAYER_READY: string
  HOST_STATE: string
  HOST_IDENTITY: string
  HOST_PHASE: string
  HOST_DEATH: string
  HOST_VOTE: string
  PLAYER_JOINED: string
  PLAYER_LEFT: string
  ROOM_CLOSED: string
}
