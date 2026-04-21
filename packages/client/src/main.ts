import './style.css';
import { initGameState, cpuDrawAndDiscard } from './game/state';
import { renderBoard } from './ui/board';
import { renderLobby, renderWaiting, renderConnectionError } from './ui/lobby';
import { WsClient } from './net/wsClient';
import { applyRoundResult } from '@mahjong/shared';
import { initMatchState } from '@mahjong/shared';
import type { GameState, Position } from '@mahjong/shared';

// ─── 設定 ──────────────────────────────────────────
const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3000';
const CPU_DELAY = 600;

// ─── 状態 ──────────────────────────────────────────
let gameState: GameState = initGameState();
let cpuTimer: ReturnType<typeof setTimeout> | null = null;
let wsClient: WsClient | null = null;
let myPosition: Position | null = null;   // オンラインモード時の自座席
let isOnline = false;

// ─── オフラインモード ────────────────────────────────

function clearCpuTimer(): void {
  if (cpuTimer !== null) { clearTimeout(cpuTimer); cpuTimer = null; }
}

function update(newState: GameState): void {
  gameState = newState;
  renderBoard(gameState, isOnline ? onlineUpdate : update, restart, nextRound, myPosition);
  if (!isOnline) scheduleCpuIfNeeded();
}

function scheduleCpuIfNeeded(): void {
  clearCpuTimer();
  if (gameState.phase === 'cpuTurn') {
    cpuTimer = setTimeout(() => {
      cpuTimer = null;
      update(cpuDrawAndDiscard(gameState));
    }, CPU_DELAY);
  }
}

function nextRound(finishedState: GameState): void {
  clearCpuTimer();
  if (isOnline) {
    wsClient?.send({ type: 'nextRound' });
    return;
  }
  const newMatch = applyRoundResult(finishedState.match, finishedState.agariInfo);
  if (newMatch.finished) {
    update({ ...initGameState(newMatch), match: newMatch });
  } else {
    update(initGameState(newMatch));
  }
}

function restart(): void {
  clearCpuTimer();
  if (isOnline) {
    wsClient?.send({ type: 'restart' });
    return;
  }
  update(initGameState(initMatchState()));
}

// ─── オンラインモード ────────────────────────────────

// オンラインでの操作は WsClient 経由でサーバーに送信する
// (サーバーがゲームを更新して全員に broadcast する)
// 牌の選択など「ローカルのみ」の状態変化もここで再レンダリングする
function onlineUpdate(newState: GameState): void {
  gameState = newState;
  renderBoard(gameState, onlineUpdate, restart, nextRound, myPosition);
}

export function sendAction(msg: Parameters<WsClient['send']>[0]): void {
  wsClient?.send(msg);
}

function startOnline(playerName: string, roomId: string): void {
  isOnline = true;

  wsClient = new WsClient(WS_URL, {
    onJoined: (pos, _roomId) => {
      myPosition = pos;
      renderWaiting(1, pos);
    },
    onWaiting: (count) => {
      if (myPosition) renderWaiting(count, myPosition);
    },
    onStateUpdate: (state) => {
      gameState = state;
      renderBoard(gameState, onlineUpdate, restart, nextRound, myPosition);
    },
    onError: (message) => {
      renderConnectionError(message, () => {
        wsClient?.disconnect();
        wsClient = null;
        isOnline = false;
        myPosition = null;
        showLobby();
      });
    },
  });

  wsClient.connect();

  // 接続完了後に join を送る (WebSocket open イベントを待つ)
  const ws = (wsClient as unknown as { ws: WebSocket | null }).ws;
  if (ws) {
    ws.addEventListener('open', () => {
      wsClient?.send({ type: 'join', roomId, playerName });
    });
  }
}

// ─── ロビー ──────────────────────────────────────────

function showLobby(): void {
  renderLobby((result) => {
    if (result.mode === 'offline') {
      isOnline = false;
      myPosition = null;
      update(initGameState(initMatchState()));
    } else {
      startOnline(result.playerName!, result.roomId!);
    }
  });
}

// ─── 初期化 ──────────────────────────────────────────
showLobby();
