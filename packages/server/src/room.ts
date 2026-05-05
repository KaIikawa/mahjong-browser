/**
 * ルーム管理
 *
 * - ルーム: 4人のプレイヤーが参加するゲームの単位
 * - プレイヤーは roomId を指定して join する
 * - 4人揃ったらゲーム開始、state を全員にブロードキャスト
 */
import { WebSocket } from 'ws';
import type { Position, GameState, MatchState } from '@mahjong/shared';
import { TURN_ORDER, initMatchState, applyRoundResult, getParent, isTenpai } from '@mahjong/shared';
import type { C2SMessage, S2CMessage } from '@mahjong/shared';
import {
  initGameState,
  discardTileAt,
  declareTsumoAt,
  declareRiichiAt,
  declareRonAt,
  cancelRonAt,
} from './actions.js';

// ─── 型定義 ───────────────────────────────────────────
export interface Room {
  id: string;
  clients: Map<Position, WebSocket>;
  playerNames: Map<Position, string>;
  state: GameState | null;
  match: MatchState;
}

// WebSocket → ルーム＋座席 のマッピング
const clientInfo = new Map<WebSocket, { room: Room; pos: Position }>();
const rooms = new Map<string, Room>();

// ─── ターンタイマー ────────────────────────────────────
const TURN_LIMIT = 20; // 1手ごとの制限時間（秒）
const roomTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearRoomTimer(roomId: string): void {
  const t = roomTimers.get(roomId);
  if (t !== undefined) { clearTimeout(t); roomTimers.delete(roomId); }
}

function broadcastState(room: Room, newState: GameState): void {
  room.state = newState;
  broadcast(room, { type: 'update', state: room.state });
  clearRoomTimer(room.id);
  // playerTurn（全員人間）のときのみタイマーを設定
  if (newState.phase === 'playerTurn') {
    const pos = newState.currentTurn;
    const t = setTimeout(() => {
      roomTimers.delete(room.id);
      if (!room.state || room.state.phase !== 'playerTurn') return;
      console.log(`[${room.id}] ${pos} timed out — auto tsumo-giri`);
      broadcastState(room, discardTileAt(room.state, pos, -1));
    }, TURN_LIMIT * 1000);
    roomTimers.set(room.id, t);
  }
}

// ─── ルーム操作 ───────────────────────────────────────
function getOrCreateRoom(id: string): Room {
  if (!rooms.has(id)) {
    rooms.set(id, {
      id,
      clients: new Map(),
      playerNames: new Map(),
      state: null,
      match: initMatchState(),
    });
  }
  return rooms.get(id)!;
}

function assignPosition(room: Room, ws: WebSocket): Position | null {
  for (const pos of TURN_ORDER) {
    if (!room.clients.has(pos)) {
      room.clients.set(pos, ws);
      return pos;
    }
  }
  return null; // full
}

// ─── 送信ヘルパー ─────────────────────────────────────
function send(ws: WebSocket, msg: S2CMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(room: Room, msg: S2CMessage): void {
  for (const [, client] of room.clients) {
    send(client, msg);
  }
}

// ─── エントリポイント: join ───────────────────────────
export function handleJoin(
  ws: WebSocket,
  roomId: string,
  playerName: string,
): void {
  const room = getOrCreateRoom(roomId);

  if (room.clients.size >= 4) {
    send(ws, { type: 'error', message: 'Room is full' });
    return;
  }

  const pos = assignPosition(room, ws);
  if (!pos) {
    send(ws, { type: 'error', message: 'Room is full' });
    return;
  }

  room.playerNames.set(pos, playerName);
  clientInfo.set(ws, { room, pos });

  send(ws, { type: 'joined', position: pos, roomId });
  broadcast(room, { type: 'waiting', playerCount: room.clients.size });

  console.log(`[${roomId}] ${playerName} joined as ${pos} (${room.clients.size}/4)`);

  // 4 人揃ったらゲーム開始
    if (room.clients.size === 4) {
      const initState = initGameState(room.match, room.playerNames);
      broadcastState(room, initState);
      console.log(`[${roomId}] Game started`);
    }
}

// ─── エントリポイント: 各種ゲームアクション ───────────────
export function handleMessage(ws: WebSocket, msg: C2SMessage): void {
  if (msg.type === 'join') {
    handleJoin(ws, msg.roomId, msg.playerName);
    return;
  }

  const info = clientInfo.get(ws);
  if (!info) return; // まだ join していない

  const { room, pos } = info;
  if (!room.state) return; // ゲーム未開始

  let newState: GameState = room.state;

  switch (msg.type) {
    case 'discard':
      newState = discardTileAt(room.state, pos, msg.index);
      break;
    case 'tsumo':
      newState = declareTsumoAt(room.state, pos);
      break;
    case 'riichi':
      newState = declareRiichiAt(room.state, pos);
      break;
    case 'ron':
      newState = declareRonAt(room.state, pos);
      break;
    case 'cancelRon':
      newState = cancelRonAt(room.state, pos);
      break;
    case 'nextRound': {
      if (newState.phase !== 'agari' && newState.phase !== 'ryukyoku') return;
      const parent = getParent(room.state.match.round);
      const parentIsTenpai =
        room.state.phase === 'ryukyoku' &&
        isTenpai(room.state.players[parent].hand);
      const newMatch = applyRoundResult(room.state.match, room.state.agariInfo, parentIsTenpai);
      if (newMatch.finished) {
        // 半荘終了: スコアのみ更新して終了フラグを伝える
        newState = { ...room.state, match: newMatch };
      } else {
        room.match = newMatch;
        newState = initGameState(room.match, room.playerNames);
      }
      break;
    }
    case 'restart': {
      room.match = initMatchState();
      newState = initGameState(room.match, room.playerNames);
      break;
    }
    default:
      return;
  }

  broadcastState(room, newState);
}

// ─── エントリポイント: 切断処理 ───────────────────────
export function handleDisconnect(ws: WebSocket): void {
  const info = clientInfo.get(ws);
  if (!info) return;

  const { room, pos } = info;
  room.clients.delete(pos);
  room.playerNames.delete(pos);
  clientInfo.delete(ws);

  console.log(`[${room.id}] ${pos} disconnected (${room.clients.size}/4)`);

  if (room.clients.size === 0) {
    clearRoomTimer(room.id);
    rooms.delete(room.id);
    console.log(`[${room.id}] Room removed`);
  } else {
    broadcast(room, { type: 'waiting', playerCount: room.clients.size });
  }
}
