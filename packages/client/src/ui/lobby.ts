/**
 * ロビー画面
 *
 * - オフライン対戦 / オンライン対戦の選択
 * - オンライン選択時: プレイヤー名・ルームID 入力 → join
 * - 待機中: 接続人数の表示
 */
import type { Position } from '@mahjong/shared';

export type LobbyMode = 'offline' | 'online';

export interface LobbyResult {
  mode: LobbyMode;
  playerName?: string;
  roomId?: string;
}

export type OnLobbySubmit = (result: LobbyResult) => void;

// ─── ロビー画面を #app に描画 ──────────────────────────
export function renderLobby(onSubmit: OnLobbySubmit): void {
  const app = document.getElementById('app')!;
  app.innerHTML = '';
  app.appendChild(buildLobby(onSubmit));
}

function buildLobby(onSubmit: OnLobbySubmit): HTMLElement {
  const container = document.createElement('div');
  container.className = 'lobby';

  const title = document.createElement('h2');
  title.textContent = 'ゲームモードを選択';
  container.appendChild(title);

  // ─── オフラインボタン ─────────────────────────────
  const offlineBtn = document.createElement('button');
  offlineBtn.className = 'lobby__btn lobby__btn--offline';
  offlineBtn.textContent = '🀄 ひとりで遊ぶ (CPU対戦)';
  offlineBtn.onclick = () => onSubmit({ mode: 'offline' });
  container.appendChild(offlineBtn);

  const sep = document.createElement('div');
  sep.className = 'lobby__sep';
  sep.textContent = 'または';
  container.appendChild(sep);

  // ─── オンラインフォーム ───────────────────────────
  const form = document.createElement('div');
  form.className = 'lobby__form';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'プレイヤー名';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = '名前を入力';
  nameInput.maxLength = 12;
  nameInput.className = 'lobby__input';
  nameLabel.appendChild(nameInput);
  form.appendChild(nameLabel);

  const roomLabel = document.createElement('label');
  roomLabel.textContent = 'ルームID';
  const roomInput = document.createElement('input');
  roomInput.type = 'text';
  roomInput.placeholder = 'room-1234';
  roomInput.maxLength = 20;
  roomInput.className = 'lobby__input';
  roomLabel.appendChild(roomInput);
  form.appendChild(roomLabel);

  const errorMsg = document.createElement('p');
  errorMsg.className = 'lobby__error';
  form.appendChild(errorMsg);

  const onlineBtn = document.createElement('button');
  onlineBtn.className = 'lobby__btn lobby__btn--online';
  onlineBtn.textContent = '🌐 オンライン対戦に参加';
  onlineBtn.onclick = () => {
    const playerName = nameInput.value.trim();
    const roomId = roomInput.value.trim();
    if (!playerName) { errorMsg.textContent = 'プレイヤー名を入力してください'; return; }
    if (!roomId)     { errorMsg.textContent = 'ルームIDを入力してください'; return; }
    errorMsg.textContent = '';
    onSubmit({ mode: 'online', playerName, roomId });
  };
  form.appendChild(onlineBtn);
  container.appendChild(form);

  return container;
}

// ─── 待機画面を #app に描画 ───────────────────────────
export function renderWaiting(playerCount: number, myPosition: Position): void {
  const app = document.getElementById('app')!;
  app.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'lobby lobby--waiting';

  const title = document.createElement('h2');
  title.textContent = '対戦相手を待っています…';
  container.appendChild(title);

  const info = document.createElement('p');
  info.className = 'lobby__count';
  info.textContent = `接続済み: ${playerCount} / 4 人`;
  container.appendChild(info);

  const pos = document.createElement('p');
  pos.className = 'lobby__pos';
  pos.textContent = `あなたの座席: ${myPosition}`;
  container.appendChild(pos);

  const spinner = document.createElement('div');
  spinner.className = 'lobby__spinner';
  container.appendChild(spinner);

  app.appendChild(container);
}

// ─── エラーメッセージを #app に描画 ──────────────────
export function renderConnectionError(message: string, onRetry: () => void): void {
  const app = document.getElementById('app')!;
  app.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'lobby lobby--error';

  const msg = document.createElement('p');
  msg.className = 'lobby__error-msg';
  msg.textContent = message;
  container.appendChild(msg);

  const btn = document.createElement('button');
  btn.className = 'lobby__btn';
  btn.textContent = '🔄 ロビーに戻る';
  btn.onclick = onRetry;
  container.appendChild(btn);

  app.appendChild(container);
}
