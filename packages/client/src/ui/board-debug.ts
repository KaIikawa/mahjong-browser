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

import type { GameState, Position, Tile, TileKind, HonorKey } from '@mahjong/shared';
import { TURN_ORDER, getTileImagePath, getTileLabel, sortHand } from '@mahjong/shared';
import { calcShanten } from '@mahjong/shared';
import { renderBoard } from './board';
import { initGameStateWithShanten, initGameStateWithHand, cpuDrawAndDiscardAt } from '../game/state';

// CPU 操作モード
export type DebugCpuMode = 'auto-discard' | 'manual' | 'ai';
type SetCpuModeFn = (mode: DebugCpuMode) => void;

// ─── 役プリセット定義 ─────────────────────────────────────
interface TileSpec { kind: TileKind; number?: number; honor?: HonorKey; }

const YAKU_PRESETS: { label: string; tiles: TileSpec[] }[] = [
  {
    label: '平和',
    // 1m2m3m 4m5m6m 2p3p 5p6p7p 9p9p  待ち: 1p or 4p (両面)
    tiles: [
      { kind: 'manzu', number: 1 }, { kind: 'manzu', number: 2 }, { kind: 'manzu', number: 3 },
      { kind: 'manzu', number: 4 }, { kind: 'manzu', number: 5 }, { kind: 'manzu', number: 6 },
      { kind: 'pinzu', number: 2 }, { kind: 'pinzu', number: 3 },
      { kind: 'pinzu', number: 5 }, { kind: 'pinzu', number: 6 }, { kind: 'pinzu', number: 7 },
      { kind: 'pinzu', number: 9 }, { kind: 'pinzu', number: 9 },
    ],
  },
  {
    label: '一盃口',
    // 1m2m3m 1m2m3m 4m5m 7p8p9p 1s1s  待ち: 3m or 6m (両面)
    tiles: [
      { kind: 'manzu', number: 1 }, { kind: 'manzu', number: 2 }, { kind: 'manzu', number: 3 },
      { kind: 'manzu', number: 1 }, { kind: 'manzu', number: 2 }, { kind: 'manzu', number: 3 },
      { kind: 'manzu', number: 4 }, { kind: 'manzu', number: 5 },
      { kind: 'pinzu', number: 7 }, { kind: 'pinzu', number: 8 }, { kind: 'pinzu', number: 9 },
      { kind: 'sozu', number: 1 }, { kind: 'sozu', number: 1 },
    ],
  },
  {
    label: 'ホンイツ',
    // 1m2m3m 5m6m7m 8m9m 東東東 発発  待ち: 4m or 7m (両面)
    tiles: [
      { kind: 'manzu', number: 1 }, { kind: 'manzu', number: 2 }, { kind: 'manzu', number: 3 },
      { kind: 'manzu', number: 5 }, { kind: 'manzu', number: 6 }, { kind: 'manzu', number: 7 },
      { kind: 'manzu', number: 8 }, { kind: 'manzu', number: 9 },
      { kind: 'tupai', honor: 'e' }, { kind: 'tupai', honor: 'e' }, { kind: 'tupai', honor: 'e' },
      { kind: 'tupai', honor: 'no' }, { kind: 'tupai', honor: 'no' },
    ],
  },
  {
    label: 'タンヤオ',
    // 2m3m4m 5m6m 2p3p4p 5p6p7p 8s8s  待ち: 4m or 7m (両面)
    tiles: [
      { kind: 'manzu', number: 2 }, { kind: 'manzu', number: 3 }, { kind: 'manzu', number: 4 },
      { kind: 'manzu', number: 5 }, { kind: 'manzu', number: 6 },
      { kind: 'pinzu', number: 2 }, { kind: 'pinzu', number: 3 }, { kind: 'pinzu', number: 4 },
      { kind: 'pinzu', number: 5 }, { kind: 'pinzu', number: 6 }, { kind: 'pinzu', number: 7 },
      { kind: 'sozu', number: 8 }, { kind: 'sozu', number: 8 },
    ],
  },
];

// spec に合う未使用の牌を pool から探す
function findTilesFromPool(specs: TileSpec[], pool: Tile[]): Tile[] | null {
  const result: Tile[] = [];
  const usedUids = new Set<number>();
  for (const spec of specs) {
    const found = pool.find(
      t =>
        !usedUids.has(t.uid) &&
        t.kind === spec.kind &&
        t.number === spec.number &&
        t.honor === spec.honor,
    );
    if (!found) return null;
    usedUids.add(found.uid);
    result.push(found);
  }
  return result;
}

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
  cpuMode: DebugCpuMode,
  setCpuMode: SetCpuModeFn,
  myPosition: Position | null = null,
): void {
  renderBoard(state, onUpdate, onRestart, onNextRound, myPosition);
  const app = document.getElementById('app')!;
  app.appendChild(buildDebugPanel(state, onUpdate, onDebugRestart, cpuMode, setCpuMode));
}

// ─── デバッグパネル全体 ────────────────────────────────
function buildDebugPanel(
  state: GameState,
  onUpdate: UpdateFn,
  onDebugRestart: DebugRestartFn,
  cpuMode: DebugCpuMode,
  setCpuMode: SetCpuModeFn,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'debug-panel';

  const header = document.createElement('div');
  header.className = 'debug-header';
  header.textContent = '🔧 DEBUG PANEL';
  panel.appendChild(header);

  panel.appendChild(buildDebugCpuMode(state, onUpdate, cpuMode, setCpuMode));
  panel.appendChild(buildDebugHands(state));
  panel.appendChild(buildDebugWall(state, onUpdate));
  panel.appendChild(buildDebugNewGame(state, onDebugRestart));

  return panel;
}

// ─── CPU 操作モードセレクター + 手動捕作 UI ────────────────
function buildDebugCpuMode(
  state: GameState,
  onUpdate: UpdateFn,
  cpuMode: DebugCpuMode,
  setCpuMode: SetCpuModeFn,
): HTMLElement {
  const section = buildSection('CPU 操作モード');

  const modeRow = document.createElement('div');
  modeRow.className = 'debug-btn-row';

  const modes: { mode: DebugCpuMode; label: string }[] = [
    { mode: 'auto-discard', label: '自動ツモ切り' },
    { mode: 'manual',       label: '手動操作' },
    { mode: 'ai',           label: 'AI操作' },
  ];

  for (const { mode, label } of modes) {
    const btn = document.createElement('button');
    btn.className = 'btn debug-btn' + (cpuMode === mode ? ' debug-btn--mode-active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => setCpuMode(mode));
    modeRow.appendChild(btn);
  }
  section.appendChild(modeRow);

  // 手動操作モード且つ cpuTurn の時: 当該 CPU の操作 UI を表示
  if (cpuMode === 'manual' && state.phase === 'cpuTurn') {
    const pos = state.currentTurn;
    const posLabels: Record<Position, string> = {
      player: 'あなた', simo: '下家', toimen: '対面', kami: '上家',
    };
    const cpuName = state.playerNames?.[pos] ?? posLabels[pos];

    const manualTitle = document.createElement('div');
    manualTitle.className = 'debug-subtitle';
    manualTitle.textContent = `${cpuName}の操作牌を選択 (13枚の手牌 + 次ツモ牌)`;
    section.appendChild(manualTitle);

    const handRow = document.createElement('div');
    handRow.className = 'debug-hand-tiles';

    // CPU手牌（13枚）+ 山の次牌（1枚）を理牌順で表示
    const cpuHand = sortHand([...state.players[pos].hand]);
    const nextWallTile = state.wall[0];
    const displayTiles = nextWallTile ? [...cpuHand, nextWallTile] : cpuHand;

    for (const tile of displayTiles) {
      const img = document.createElement('img');
      img.src = getTileImagePath(tile);
      img.alt = getTileLabel(tile);
      img.draggable = false;
      img.title = `${getTileLabel(tile)} — この牌を捨てる`;
      img.className = 'debug-tile debug-tile--wall' + (tile.uid === nextWallTile?.uid ? ' debug-tile--next' : '');
      img.addEventListener('click', () => {
        onUpdate(cpuDrawAndDiscardAt(state, tile.uid));
      });
      handRow.appendChild(img);
    }
    section.appendChild(handRow);
  }

  return section;
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

    // 手牌を理牌順にソートして表示
    const hand = sortHand([...state.players[pos].hand]);
    const tsumo = pos === state.currentTurn && state.drawnTile ? [state.drawnTile] : [];
    const tiles = [...hand, ...tsumo];

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

// ─── セクション2: 残りツモ山 ───────────────────────────────────
function buildDebugWall(state: GameState, onUpdate: UpdateFn): HTMLElement {
  // 現在の手番プレイヤーからプレイヤー(自分)の次ツモまで何枚消費されるか計算
  // playerTurn なら山[0]を自分の次ツモに設定する (drawnTileはすでに設定済みのため swap)
  // cpuTurn なら CPU の次数分の後持に自分のツモが発生する

  const playerDrawOffset = calcPlayerDrawOffset(state);
  const section = buildSection(
    `残りツモ山 (${state.wall.length}枚) — 牌をクリックで「自分の次ツモ」に指定 (現在の位置: wall[${playerDrawOffset}])`,
  );

  const wallGrid = document.createElement('div');
  wallGrid.className = 'debug-wall-grid';

  const sorted = sortHand([...state.wall]);
  sorted.forEach((tile) => {
    const origIdx = state.wall.findIndex(t => t.uid === tile.uid);
    const img = document.createElement('img');
    img.src = getTileImagePath(tile);
    img.alt = getTileLabel(tile);
    img.draggable = false;
    img.title = `${getTileLabel(tile)} — クリックで自分の次ツモに指定`;
    // 現在自分の次ツモ位置をハイライト
    img.className =
      'debug-tile debug-tile--wall' + (origIdx === playerDrawOffset ? ' debug-tile--next' : '');
    img.addEventListener('click', () => {
      onUpdate(setPlayerNextDraw(state, tile));
    });
    wallGrid.appendChild(img);
  });

  // playerTurn且つ drawnTile ありの場合は置換対象の説明を追加
  if (state.phase === 'playerTurn' && state.drawnTile) {
    const note = document.createElement('div');
    note.className = 'debug-subtitle';
    note.textContent = `※ 自分はすでにツモ済み (${getTileLabel(state.drawnTile)})。クリックするとそのツモ牌と入れ替えます。`;
    section.appendChild(note);
  }

  section.appendChild(wallGrid);
  return section;
}

// 自分 ('player') の次ツモ位置 (wall[何番目]) を返す
function calcPlayerDrawOffset(state: GameState): number {
  if (state.phase !== 'cpuTurn') return 0;
  let offset = 0;
  let cur = TURN_ORDER.indexOf(state.currentTurn);
  while (TURN_ORDER[cur % 4] !== 'player') {
    offset++;
    cur++;
  }
  return offset;
}

// 指定牌を自分の次ツモに設定する
function setPlayerNextDraw(state: GameState, tile: Tile): GameState {
  const idx = state.wall.findIndex(t => t.uid === tile.uid);
  if (idx === -1) return state;

  // playerTurn 且つ drawnTile あり → drawnTile と入れ替え
  if (state.phase === 'playerTurn' && state.drawnTile) {
    const newWall = [...state.wall];
    newWall.splice(idx, 1, state.drawnTile); // 古い drawnTile を山の同位置に戻す
    return { ...state, drawnTile: tile, wall: newWall };
  }

  // cpuTurn → 自分のツモ位置まで移動
  const offset = calcPlayerDrawOffset(state);
  const newWall = [...state.wall];
  newWall.splice(idx, 1);
  newWall.splice(offset, 0, tile);
  return { ...state, wall: newWall };
}

// ─── セクション3: カスタム配牌 ───────────────────────────
function buildDebugNewGame(state: GameState, onDebugRestart: DebugRestartFn): HTMLElement {
  const section = buildSection('新規配牌');

  // シャンテン数指定ボタン行
  const shantenLabel = document.createElement('div');
  shantenLabel.className = 'debug-subtitle';
  shantenLabel.textContent = 'シャンテン数指定';
  section.appendChild(shantenLabel);

  const shantenRow = document.createElement('div');
  shantenRow.className = 'debug-btn-row';

  const shantenPresets: { label: string; shanten: number }[] = [
    { label: 'ランダム',    shanten: -1 },
    { label: '聴牌(0向聴)', shanten: 0  },
    { label: '1向聴',       shanten: 1  },
    { label: '2向聴',       shanten: 2  },
  ];

  for (const { label, shanten } of shantenPresets) {
    const btn = document.createElement('button');
    btn.className = 'btn debug-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      onDebugRestart(initGameStateWithShanten(shanten, state.match));
    });
    shantenRow.appendChild(btn);
  }

  section.appendChild(shantenRow);
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

  // 役プリセットボタン行
  const yakuLabel = document.createElement('div');
  yakuLabel.className = 'debug-subtitle';
  yakuLabel.textContent = '役プリセット（テンパイ手牌を自動選択）';
  container.appendChild(yakuLabel);

  const yakuRow = document.createElement('div');
  yakuRow.className = 'debug-btn-row';
  container.appendChild(yakuRow);

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

  // 役プリセットボタンの生成（selected が確定してから関数参照できるよう後置）
  const availableForPreset: Tile[] = [
    ...state.wall,
    ...TURN_ORDER.flatMap(pos => state.players[pos].hand),
    ...(state.drawnTile ? [state.drawnTile] : []),
  ];

  for (const preset of YAKU_PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'btn debug-btn debug-btn--yaku';
    btn.textContent = preset.label;
    btn.addEventListener('click', () => {
      const tiles = findTilesFromPool(preset.tiles, availableForPreset);
      if (!tiles) {
        btn.textContent = `${preset.label} (牌不足)`;
        return;
      }
      // 既存の選択をリセットしてプリセット牌を選択
      selected.length = 0;
      pickerGrid.querySelectorAll('.debug-tile--picker--selected').forEach(el =>
        el.classList.remove('debug-tile--picker--selected'),
      );
      for (const tile of tiles) {
        selected.push(tile);
        const el = pickerGrid.querySelector<HTMLImageElement>(`[data-uid="${tile.uid}"]`);
        el?.classList.add('debug-tile--picker--selected');
      }
      refreshSelected();
    });
    yakuRow.appendChild(btn);
  }

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

  // ピッカーグリッド: 現在のゲームで未使用の全牌（理牌順にソート）
  const availableTiles: Tile[] = sortHand([
    ...state.wall,
    ...TURN_ORDER.flatMap(pos => state.players[pos].hand),
    ...(state.drawnTile ? [state.drawnTile] : []),
  ]);

  const pickerGrid = document.createElement('div');
  pickerGrid.className = 'debug-picker-grid';

  for (const tile of availableTiles) {
    const img = document.createElement('img');
    img.src = getTileImagePath(tile);
    img.alt = getTileLabel(tile);
    img.className = 'debug-tile debug-tile--picker';
    img.dataset.uid = String(tile.uid);
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
