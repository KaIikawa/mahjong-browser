import type { GameState, Position, Tile } from '@mahjong/shared';
import { ROUND_LABELS, TURN_ORDER } from '@mahjong/shared';
import { getTileImagePath, getDiscardImagePath, getBackImagePath, getTileLabel } from '@mahjong/shared';
import { selectTile, discardTile, declareTsumo, declareRiichi } from '../game/state';
import { calcShanten, isAgari } from '@mahjong/shared';
import { isTenpai } from '@mahjong/shared';
import { hasValidYaku, detectYaku } from '@mahjong/shared';
import { getParent, calcRanking } from '@mahjong/shared';
import { sendAction } from '../main';

type UpdateFn  = (s: GameState) => void;
type RestartFn = () => void;

// ─── 自風を返す ('東'|'南'|'西'|'北') ───────────────────
function getSelfWind(pos: Position, round: number): string {
  const parentIdx = TURN_ORDER.indexOf(getParent(round));
  const posIdx    = TURN_ORDER.indexOf(pos);
  return ['東', '南', '西', '北'][(posIdx - parentIdx + 4) % 4];
}
type NextRoundFn = (s: GameState) => void;

// ─── メインレンダラー ────────────────────────────────────
export function renderBoard(
  state: GameState,
  onUpdate: UpdateFn,
  onRestart: RestartFn,
  onNextRound: NextRoundFn,
  myPosition: Position | null = null,
): void {
  const app = document.getElementById('app')!;
  app.innerHTML = '';
  app.appendChild(buildBoard(state, onUpdate, onRestart, onNextRound, myPosition));
}

// ─── 盤面全体の構築 ─────────────────────────────────
function buildBoard(
  state: GameState,
  onUpdate: UpdateFn,
  onRestart: RestartFn,
  onNextRound: NextRoundFn,
  myPosition: Position | null,
): HTMLElement {
  const board = document.createElement('div');
  board.className = 'board';

  // スコアパネル (常時表示)
  board.appendChild(buildScorePanel(state));

  // 座席マッピング: 画面上の見た目位置 → 実際の座席
  // selfPos=自分, simoPos=右(下家), toimenPos=上(対面), kamiPos=左(上家)
  const selfPos:   Position = myPosition ?? 'player';
  const order = TURN_ORDER; // ['player','simo','toimen','kami']
  const selfIdx = order.indexOf(selfPos);
  const simoPos:   Position = order[(selfIdx + 1) % 4];
  const toimenPos: Position = order[(selfIdx + 2) % 4];
  const kamiPos:   Position = order[(selfIdx + 3) % 4];

  // ① 対面エリア (上) - 手牌のみ
  board.appendChild(buildOpponentArea(state, toimenPos, 'toimen'));

  // ② 中段: 上家 | 中央テーブル(河+山情報) | 下家
  const middle = document.createElement('div');
  middle.className = 'middle-row';
  middle.appendChild(buildOpponentArea(state, kamiPos, 'kami'));
  middle.appendChild(buildCenterTable(state, selfPos, simoPos, toimenPos, kamiPos));
  middle.appendChild(buildOpponentArea(state, simoPos, 'simo'));
  board.appendChild(middle);

  // ③ 自分エリア (下) - 手牌+ボタン
  board.appendChild(buildPlayerArea(state, onUpdate, onRestart, onNextRound, myPosition));

  return board;
}

// ─── スコアパネル ────────────────────────────────────
function buildScorePanel(state: GameState): HTMLElement {
  const { match } = state;
  const panel = document.createElement('div');
  panel.className = 'score-panel';

  const parent = getParent(match.round);
  const roundLabel = ROUND_LABELS[match.round] ?? '終了';
  const honbaText  = match.honba > 0 ? ` ${match.honba}本場` : '';

  const roundEl = document.createElement('div');
  roundEl.className = 'score-round';
  roundEl.textContent = roundLabel + honbaText;
  panel.appendChild(roundEl);

  const positions: { pos: Position; label: string }[] = [
    { pos: 'player',  label: '自分' },
    { pos: 'simo',    label: '下家' },
    { pos: 'toimen',  label: '対面' },
    { pos: 'kami',    label: '上家' },
  ];

  const scoreList = document.createElement('div');
  scoreList.className = 'score-list';

  for (const { pos, label } of positions) {
    const entry = document.createElement('div');
    entry.className = 'score-entry' + (pos === parent ? ' score-entry--parent' : '');

    const nameEl = document.createElement('span');
    nameEl.className = 'score-name';
    const wind = getSelfWind(pos, match.round);
    nameEl.textContent = `${label}(${wind}${pos === parent ? '・親' : ''})`;
    entry.appendChild(nameEl);

    const scoreEl = document.createElement('span');
    scoreEl.className = 'score-value';
    scoreEl.textContent = match.scores[pos].toLocaleString();
    entry.appendChild(scoreEl);

    scoreList.appendChild(entry);
  }
  panel.appendChild(scoreList);

  return panel;
}

// ─── 対面/上家/下家エリア (手牌のみ) ─────────────────────
function buildOpponentArea(state: GameState, actualPos: Position, visualPos: 'toimen' | 'kami' | 'simo'): HTMLElement {
  const area = document.createElement('div');
  area.className = `area area--${visualPos}`;

  const labels: Record<string, string> = { toimen: '対面', kami: '上家', simo: '下家' };
  area.appendChild(buildLabel(labels[visualPos]));
  area.appendChild(buildCpuHand(state, actualPos, visualPos));

  return area;
}

// ─── 中央テーブル (4方向の河 + 山残り情報) ─────────────
function buildCenterTable(
  state: GameState,
  selfPos: Position,
  simoPos: Position,
  toimenPos: Position,
  kamiPos: Position,
): HTMLElement {
  const center = document.createElement('div');
  center.className = 'center-table';

  // 上段: 対面の河
  center.appendChild(buildDiscardZone(state, toimenPos, 'toimen'));

  // 中段: 上家の河 | 山情報 | 下家の河
  const centerRow = document.createElement('div');
  centerRow.className = 'center-row';

  centerRow.appendChild(buildDiscardZone(state, kamiPos, 'kami'));
  centerRow.appendChild(buildWallInfo(state));
  centerRow.appendChild(buildDiscardZone(state, simoPos, 'simo'));

  center.appendChild(centerRow);

  // 下段: 自分の河
  center.appendChild(buildDiscardZone(state, selfPos, 'player'));

  return center;
}

// ─── 山情報エリア ────────────────────────────────────
function buildWallInfo(state: GameState): HTMLElement {
  const info = document.createElement('div');
  info.className = 'wall-info';

  const wallCount = document.createElement('div');
  wallCount.className = 'wall-count';
  wallCount.textContent = '山 残り';

  const wallNum = document.createElement('span');
  wallNum.className = 'wall-count__num';
  wallNum.textContent = String(state.wall.length);
  wallCount.appendChild(wallNum);

  const wallUnit = document.createElement('span');
  wallUnit.textContent = '枚';
  wallCount.appendChild(wallUnit);

  info.appendChild(wallCount);

  // ドラ表示牌
  const doraWrap = document.createElement('div');
  doraWrap.className = 'dora-wrap';
  const doraLabel = document.createElement('span');
  doraLabel.className = 'dora-label';
  doraLabel.textContent = 'ドラ表示';
  doraWrap.appendChild(doraLabel);
  const doraImg = document.createElement('img');
  doraImg.src = getTileImagePath(state.doraTile);
  doraImg.alt = getTileLabel(state.doraTile);
  doraImg.draggable = false;
  doraImg.className = 'dora-tile';
  doraWrap.appendChild(doraImg);
  info.appendChild(doraWrap);

  const msg = document.createElement('div');
  msg.className = 'phase-msg';
  if (state.phase === 'playerTurn') {
    const labels: Record<string, string> = { player: '自分', simo: '下家', toimen: '対面', kami: '上家' };
    msg.textContent = `${labels[state.currentTurn] ?? ''}の番`;
  } else if (state.phase === 'cpuTurn') {
    const labels: Record<string, string> = { simo: '下家', toimen: '対面', kami: '上家' };
    msg.textContent = `${labels[state.currentTurn] ?? ''}の番`;
  } else if (state.phase === 'agari') {
    const winnerLabels: Record<string, string> = { player: '自分', simo: '下家', toimen: '対面', kami: '上家' };
    msg.textContent = `${winnerLabels[state.agariInfo!.winner]}の和了！`;
  } else if (state.phase === 'ryukyoku') {
    msg.textContent = '流局';
  }
  info.appendChild(msg);

  return info;
}

// ─── 捨て牌ゾーン (4方向共通、_furo.gif を使用) ─────────
// actualPos: データアクセス用実座席, visualPos: CSS/画像パス用視覚位置
function buildDiscardZone(state: GameState, actualPos: Position, visualPos: Position): HTMLElement {
  const zone = document.createElement('div');
  zone.className = `discard-zone discard-zone--${visualPos}`;

  state.players[actualPos].discards.forEach((tile) => {
    const img = document.createElement('img');
    img.src = getDiscardImagePath(tile, visualPos);
    img.alt = getTileLabel(tile);
    img.draggable = false;
    img.className = 'discard-tile';
    zone.appendChild(img);
  });

  return zone;
}

// ─── CPU手牌 (裏向き) ────────────────────────────────
// actualPos: データアクセス用実座席, visualPos: CSS/画像パス用視覚位置
function buildCpuHand(state: GameState, actualPos: Position, visualPos: Position): HTMLElement {
  const handEl = document.createElement('div');
  handEl.className = `hand hand--${visualPos}`;
  if (state.currentTurn === actualPos) {
    handEl.classList.add('hand--active');
  }

  const count = state.players[actualPos].hand.length;
  const backSrc = getBackImagePath(visualPos);

  for (let i = 0; i < count; i++) {
    const img = document.createElement('img');
    img.src = backSrc;
    img.alt = '裏';
    img.className = 'tile tile--back';
    handEl.appendChild(img);
  }
  return handEl;
}

// ─── 自分の手牌 ──────────────────────────────────────
function buildPlayerHand(
  state: GameState,
  selfPos: Position,
  isMyTurn: boolean,
  isOnline: boolean,
  onUpdate: UpdateFn,
): HTMLElement {
  const handEl = document.createElement('div');
  handEl.className = 'hand hand--player';

  const tiles = state.players[selfPos].hand;
  const isRiichi = state.riichi[selfPos];

  tiles.forEach((tile, i) => {
    handEl.appendChild(buildTileImg(tile, {
      selected: state.selectedIndex === i,
      className: 'tile--hand',
      onClick: isMyTurn && !isRiichi
        ? () => {
            if (isOnline) {
              const selected = state.selectedIndex === i ? null : i;
              onUpdate({ ...state, selectedIndex: selected });
            } else {
              onUpdate(selectTile(state, i));
            }
          }
        : undefined,
    }));
  });

  // ツモ牌スロット: 常に固定幅で確保
  const sep = document.createElement('span');
  sep.className = 'tile-sep';
  handEl.appendChild(sep);

  const drawnSlot = document.createElement('div');
  drawnSlot.className = 'tile-drawn-slot';

  if (state.drawnTile && isMyTurn) {
    drawnSlot.appendChild(buildTileImg(state.drawnTile, {
      selected: state.selectedIndex === -1,
      className: 'tile--drawn',
      onClick: () => {
        if (isOnline) {
          const selected = state.selectedIndex === -1 ? null : -1;
          onUpdate({ ...state, selectedIndex: selected });
        } else {
          onUpdate(selectTile(state, -1));
        }
      },
    }));
  }

  handEl.appendChild(drawnSlot);

  return handEl;
}

// ─── 自分エリア ──────────────────────────────────────
function buildPlayerArea(
  state: GameState,
  onUpdate: UpdateFn,
  onRestart: RestartFn,
  onNextRound: NextRoundFn,
  myPosition: Position | null,
): HTMLElement {
  const area = document.createElement('div');
  area.className = 'area area--player';

  // オンライン時は「自分の座席」の手牌を表示する
  // myPosition=null はオフライン (player 固定)
  const selfPos: Position = myPosition ?? 'player';
  // 自分の手番かどうか (オンライン時は currentTurn が自座席のみ操作可)
  const isMyTurn = state.phase === 'playerTurn' && state.currentTurn === selfPos;
  const isOnline = myPosition !== null;

  area.appendChild(buildPlayerHand(state, selfPos, isMyTurn, isOnline, onUpdate));

  const playerTiles = state.players[selfPos].hand;
  const shanten = calcShanten(playerTiles);
  const isRiichi = state.riichi[selfPos];
  if (isRiichi) {
    const riichiLabel = document.createElement('span');
    riichiLabel.className = 'riichi-label';
    riichiLabel.textContent = '立直';
    area.appendChild(riichiLabel);
  } else if (shanten === 0) {
    const tenpaiLabel = document.createElement('span');
    tenpaiLabel.className = 'tenpai-label';
    tenpaiLabel.textContent = '聴牌';
    area.appendChild(tenpaiLabel);
  }

  area.appendChild(buildLabel('自分'));

  const btnRow = document.createElement('div');
  btnRow.className = 'btn-row';

  // 捨て牌ボタン: リーチ中はツモ切りのみ
  const discardBtn = document.createElement('button');
  discardBtn.className = 'btn btn--discard';
  discardBtn.textContent = isRiichi ? 'ツモ切り' : '捨て牌';
  const canDiscard = isMyTurn && (
    isRiichi ? !!state.drawnTile : state.selectedIndex !== null
  );
  discardBtn.disabled = !canDiscard;
  if (canDiscard) {
    discardBtn.addEventListener('click', () => {
      const idx = isRiichi ? -1 : state.selectedIndex!;
      if (isOnline) {
        sendAction({ type: 'discard', index: idx });
      } else {
        onUpdate(discardTile(state, idx));
      }
    });
  }
  btnRow.appendChild(discardBtn);

  // リーチボタン
  const canRiichi = isMyTurn && !isRiichi &&
    !!state.drawnTile && isTenpai(playerTiles);
  const riichiBtn = document.createElement('button');
  riichiBtn.className = 'btn btn--riichi';
  riichiBtn.textContent = 'リーチ';
  riichiBtn.disabled = !canRiichi;
  if (canRiichi) {
    riichiBtn.addEventListener('click', () => {
      if (isOnline) {
        sendAction({ type: 'riichi' });
      } else {
        onUpdate(declareRiichi(state));
      }
    });
  }
  btnRow.appendChild(riichiBtn);

  // ツモ和了ボタン
  const tsumoBtn = document.createElement('button');
  tsumoBtn.className = 'btn btn--tsumo';
  tsumoBtn.textContent = 'ツモ';
  const hand14 = state.drawnTile ? [...playerTiles, state.drawnTile] : [];
  const agariCheck = isMyTurn && hand14.length === 14 && isAgari(hand14);
  const yakuCheck = agariCheck
    ? hasValidYaku(detectYaku(hand14, true, isRiichi, state.doraTile, selfPos))
    : false;
  const canTsumo = agariCheck && yakuCheck;
  tsumoBtn.disabled = !canTsumo;
  if (canTsumo) {
    tsumoBtn.addEventListener('click', () => {
      if (isOnline) {
        sendAction({ type: 'tsumo' });
      } else {
        onUpdate(declareTsumo(state));
      }
    });
  }
  btnRow.appendChild(tsumoBtn);

  area.appendChild(btnRow);

  // 和了オーバーレイ
  if (state.phase === 'agari') {
    const info = state.agariInfo!;
    const overlay = document.createElement('div');
    overlay.className = 'agari-overlay';
    const winnerLabels: Record<string, string> = { player: '自分', simo: '下家', toimen: '対面', kami: '上家' };
    const winnerName = winnerLabels[info.winner];
    const agariType = info.isTsumo ? 'ツモ' : 'ロン';

    const title = document.createElement('span');
    title.className = 'agari-title';
    title.textContent = '和　了';
    overlay.appendChild(title);

    const winner = document.createElement('span');
    winner.className = 'agari-winner';
    winner.textContent = `${winnerName} の${agariType}`;
    overlay.appendChild(winner);

    // 役一覧
    if (info.yakuList.length > 0) {
      const yakuTable = document.createElement('div');
      yakuTable.className = 'agari-yaku-table';
      info.yakuList.forEach(y => {
        const row = document.createElement('div');
        row.className = 'agari-yaku-row';
        row.innerHTML = `<span class="yaku-name">${y.name}</span><span class="yaku-han">${y.han}翻</span>`;
        yakuTable.appendChild(row);
      });
      // 合計
      const total = document.createElement('div');
      total.className = 'agari-yaku-total';
      total.textContent = `${info.han}翻${info.fu}符`;
      yakuTable.appendChild(total);
      overlay.appendChild(yakuTable);
    }

    // 点数
    const score = document.createElement('span');
    score.className = 'agari-score';
    score.textContent = info.scoreDetail;
    overlay.appendChild(score);

    // 半荘終了なら「終了画面へ」、通常は「次の局へ」
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn--restart';
    if (state.match.finished) {
      nextBtn.textContent = '結果を見る';
      nextBtn.addEventListener('click', () => onNextRound(state));
    } else {
      nextBtn.textContent = '次の局へ';
      nextBtn.addEventListener('click', () => onNextRound(state));
    }
    overlay.appendChild(nextBtn);
    area.appendChild(overlay);
  }

  // 流局オーバーレイ
  if (state.phase === 'ryukyoku') {
    const overlay = document.createElement('div');
    overlay.className = 'ryukyoku-overlay';
    overlay.textContent = '流　局';
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn--restart';
    nextBtn.textContent = state.match.finished ? '結果を見る' : '次の局へ';
    nextBtn.addEventListener('click', () => onNextRound(state));
    overlay.appendChild(nextBtn);
    area.appendChild(overlay);
  }

  // 半荘終了オーバーレイ (finished かつ agari/ryukyoku を経由してすでに nextRound 処理済みの場合)
  if (state.match.finished && state.phase !== 'agari' && state.phase !== 'ryukyoku') {
    area.appendChild(buildFinishedOverlay(state, onRestart));
  }

  return area;
}

// ─── 半荘終了画面 ────────────────────────────────────
function buildFinishedOverlay(state: GameState, onRestart: RestartFn): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'finished-overlay';

  const title = document.createElement('span');
  title.className = 'finished-title';
  title.textContent = '半荘終了';
  overlay.appendChild(title);

  const ranking = calcRanking(state.match.scores);
  const posLabels: Record<Position, string> = { player: '自分', simo: '下家', toimen: '対面', kami: '上家' };

  const rankTable = document.createElement('div');
  rankTable.className = 'rank-table';

  const sorted = [...ranking].sort((a, b) => a.rank - b.rank);
  sorted.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'rank-row' + (entry.pos === 'player' ? ' rank-row--self' : '');

    const rankEl = document.createElement('span');
    rankEl.className = 'rank-num';
    rankEl.textContent = `${entry.rank}位`;

    const nameEl = document.createElement('span');
    nameEl.className = 'rank-name';
    nameEl.textContent = posLabels[entry.pos];

    const scoreEl = document.createElement('span');
    scoreEl.className = 'rank-score';
    scoreEl.textContent = entry.score.toLocaleString() + 'pt';

    row.appendChild(rankEl);
    row.appendChild(nameEl);
    row.appendChild(scoreEl);
    rankTable.appendChild(row);
  });
  overlay.appendChild(rankTable);

  const restartBtn = document.createElement('button');
  restartBtn.className = 'btn btn--restart';
  restartBtn.textContent = 'もう一度';
  restartBtn.addEventListener('click', onRestart);
  overlay.appendChild(restartBtn);

  return overlay;
}

// ─── 汎用: 手牌画像要素の生成 ────────────────────────
function buildTileImg(
  tile: Tile,
  opts: { selected?: boolean; className?: string; onClick?: () => void } = {},
): HTMLImageElement {
  const img = document.createElement('img');
  img.src = getTileImagePath(tile);
  img.alt = getTileLabel(tile);
  img.draggable = false;

  const classes = ['tile'];
  if (opts.className) classes.push(opts.className);
  if (opts.selected) classes.push('tile--selected');
  img.className = classes.join(' ');

  if (opts.onClick) {
    img.style.cursor = 'pointer';
    img.addEventListener('click', opts.onClick);
  }
  return img;
}

// ─── 汎用: プレイヤーラベル ─────────────────────────
function buildLabel(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'player-label';
  el.textContent = text;
  return el;
}


