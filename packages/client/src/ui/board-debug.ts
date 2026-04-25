/**
 * デバッグ用ボード画面
 *
 * - 通常のボード（renderBoard）の下にデバッグパネルを追加表示する
 * - URL ハッシュ #debug でのみアクセス可能
 *
 * [デバッグパネル機能]
 * 1. 全プレイヤーの手牌をオモテで表示（シャンテン数付き）
 * 2. 残りツモ山を全表示。クリックした牌を次ツモに移動できる
 * 3. 新規配牌: ランダム / シャンテン数指定 / 手牌直接指定
 */

import type { GameState, Position, Tile } from '@mahjong/shared';
import { TURN_ORDER, getTileImagePath, getTileLabel } from '@mahjong/shared';
import { calcShanten } from '@mahjong/shared';
import { renderBoard } from './board';
import { initGameStateWithShanten, initGameStateWithHand } from '../game/state';

type UpdateFn       = (s: GameState) => void;
type RestartFn      = () => void;
type NextRoundFn    = (s: GameState) => void;
type DebugRestartFn = (s: GameState) => void;

// ─── デバッグ版レンダラー ──────────────────────────────
export function renderBoardDebug(
  state: GameState,
  onUpdate: UpdateFn,
  onRestart: RestartFn,
  onNextRound: NextRoundFn,
  onDebugRestart: DebugRestartFn,
  myPosition: Position | null = null,
): void {
  renderBoard(state, onUpdate, onRestart, onNextRound, myPosition);
  const app = document.getElementById('app')!;
  app.appendChild(buildDebugPanel(state, onUpdate, onDebugRestart));
}

// ─── デバッグパネル全体 ────────────────────────────────
function buildDebugPanel(
  state: GameState,
  onUpdate: UpdateFn,
  onDebugRestart: DebugRestartFn,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'debug-panel';

  const header = document.createElement('div');
  header.className = 'debug-header';
  header.textContent = '🔧 DEBUG PANEL';
  panel.appendChild(header);

  panel.appendChild(buildDebugHands(state));
  panel.appendChild(buildDebugWall(state, onUpdate));
  panel.appendChild(buildDebugNewGame(state, onDebugRestart));

  return panel;
}

// ─── セクション1: 全プレイヤー手牌（表向き）+ シャンテン数 ─
function buildDebugHands(state: GameState): HTMLElement {
  const section = buildSection('全プレイヤー手牌（シャンテン数）');

  const posLabels: Record<Position, string> = {
    player: 'あなた', simo: '下家', toimen: '対面', kami: '上家',
  };

  for (const pos of TURN_ORDER) {
    const row = document.createElement('div');
    row.className = 'debug-hand-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'debug-hand-label';
    nameEl.textContent = `${state.playerNames?.[pos] ?? posLabels[pos]}:`;
    row.appendChild(nameEl);

    const tilesEl = document.createElement('div');
    tilesEl.className = 'debug-hand-tiles';

    const tiles = [...state.players[pos].hand];
    if (pos === state.currentTurn && state.drawnTile) {
      tiles.push(state.drawnTile);
    }

    for (const tile of tiles) {
      const img = document.createElement('img');
      img.src = getTileImagePath(tile);
      img.alt = getTileLabel(tile);
      img.className = 'debug-tile';
      img.draggable = false;
      tilesEl.appendChild(img);
    }

    const sh = calcShanten(tiles);
    const shantenEl = document.createElement('span');
    shantenEl.className = 'debug-shanten';
    shantenEl.textContent = sh === -1 ? '和了' : sh === 0 ? '聴牌' : `${sh}向聴`;
    tilesEl.appendChild(shantenEl);

    row.appendChild(tilesEl);
    section.appendChild(row);
  }

  return section;
}

// ─── セクション2: 残りツモ山 + 次ツモ牌選択 ─────────────
function buildDebugWall(state: GameState, onUpdate: UpdateFn): HTMLElement {
  const section = buildSection(
    `残りツモ山 (${state.wall.length}枚) — 牌をクリックで次ツモに移動`,
  );

  const wallGrid = document.createElement('div');
  wallGrid.className = 'debug-wall-grid';

  state.wall.forEach((tile, idx) => {
    const img = document.createElement('img');
    img.src = getTileImagePath(tile);
    img.alt = getTileLabel(tile);
    img.draggable = false;
    img.title = `${getTileLabel(tile)} — クリックで次ツモに設定`;
    img.className =
      'debug-tile debug-tile--wall' + (idx === 0 ? ' debug-tile--next' : '');
    img.addEventListener('click', () => {
      const newWall = [...state.wall];
      newWall.splice(idx, 1);
      newWall.unshift(tile);
      onUpdate({ ...state, wall: newWall });
    });
    wallGrid.appendChild(img);
  });

  section.appendChild(wallGrid);
  return section;
}

// ─── セクション3: カスタム配牌 ───────────────────────────
function buildDebugNewGame(state: GameState, onDebugRestart: DebugRestartFn): HTMLElement {
  const section = buildSection('新規配牌');

  // シャンテン数指定ボタン行
  const btnRow = document.createElement('div');
  btnRow.className = 'debug-btn-row';

  const presets: { label: string; shanten: number }[] = [
    { label: 'ランダム',    shanten: -1 },
    { label: '聴牌(0向聴)', shanten: 0  },
    { label: '1向聴',       shanten: 1  },
    { label: '2向聴',       shanten: 2  },
  ];

  for (const { label, shanten } of presets) {
    const btn = document.createElement('button');
    btn.className = 'btn debug-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      onDebugRestart(initGameStateWithShanten(shanten, state.match));
    });
    btnRow.appendChild(btn);
  }

  section.appendChild(btnRow);
  section.appendChild(buildHandPicker(state, onDebugRestart));
  return section;
}

// ─── 手牌ピッカー: 13枚を選択して適用 ──────────────────
function buildHandPicker(state: GameState, onDebugRestart: DebugRestartFn): HTMLElement {
  const container = document.createElement('div');
  container.className = 'debug-hand-picker';

  const subTitle = document.createElement('div');
  subTitle.className = 'debug-subtitle';
  subTitle.textContent = '手牌直接指定 — 13枚選択後に「適用」';
  container.appendChild(subTitle);

  // 選択済み牌の表示エリア
  const selectedArea = document.createElement('div');
  selectedArea.className = 'debug-selected-area';
  const countEl = document.createElement('span');
  countEl.className = 'debug-selected-count';
  countEl.textContent = '選択済: 0 / 13';
  selectedArea.appendChild(countEl);
  container.appendChild(selectedArea);

  // 操作ボタン行
  const ctrlRow = document.createElement('div');
  ctrlRow.className = 'debug-btn-row';

  const applyBtn = document.createElement('button');
  applyBtn.className = 'btn debug-btn debug-btn--apply';
  applyBtn.textContent = '手牌を適用して開始';
  applyBtn.disabled = true;

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn debug-btn';
  resetBtn.textContent = '選択リセット';

  ctrlRow.appendChild(applyBtn);
  ctrlRow.appendChild(resetBtn);
  container.appendChild(ctrlRow);

  // 選択牌の管理
  const selected: Tile[] = [];

  function refreshSelected(): void {
    countEl.textContent = `選択済: ${selected.length} / 13`;
    applyBtn.disabled = selected.length !== 13;
    selectedArea.querySelectorAll('img').forEach(el => el.remove());
    for (const tile of selected) {
      const img = document.createElement('img');
      img.src = getTileImagePath(tile);
      img.alt = getTileLabel(tile);
      img.className = 'debug-tile debug-tile--thumb';
      img.draggable = false;
      selectedArea.appendChild(img);
    }
  }

  applyBtn.addEventListener('click', () => {
    if (selected.length === 13) {
      onDebugRestart(initGameStateWithHand([...selected], state.match));
    }
  });

  resetBtn.addEventListener('click', () => {
    selected.length = 0;
    refreshSelected();
    pickerGrid.querySelectorAll('.debug-tile--picker--selected').forEach(el =>
      el.classList.remove('debug-tile--picker--selected'),
    );
  });

  // ピッカーグリッド: 現在のゲームで未使用の全牌
  const availableTiles: Tile[] = [
    ...state.wall,
    ...TURN_ORDER.flatMap(pos => state.players[pos].hand),
    ...(state.drawnTile ? [state.drawnTile] : []),
  ];

  const pickerGrid = document.createElement('div');
  pickerGrid.className = 'debug-picker-grid';

  for (const tile of availableTiles) {
    const img = document.createElement('img');
    img.src = getTileImagePath(tile);
    img.alt = getTileLabel(tile);
    img.className = 'debug-tile debug-tile--picker';
    img.draggable = false;
    img.title = getTileLabel(tile);
    img.addEventListener('click', () => {
      if (img.classList.contains('debug-tile--picker--selected')) {
        const i = selected.findIndex(t => t.uid === tile.uid);
        if (i !== -1) selected.splice(i, 1);
        img.classList.remove('debug-tile--picker--selected');
      } else if (selected.length < 13) {
        selected.push(tile);
        img.classList.add('debug-tile--picker--selected');
      }
      refreshSelected();
    });
    pickerGrid.appendChild(img);
  }

  container.appendChild(pickerGrid);
  return container;
}

// ─── ユーティリティ: セクション要素の生成 ────────────────
function buildSection(title: string): HTMLElement {
  const section = document.createElement('div');
  section.className = 'debug-section';
  const h = document.createElement('div');
  h.className = 'debug-section-title';
  h.textContent = title;
  section.appendChild(h);
  return section;
}
