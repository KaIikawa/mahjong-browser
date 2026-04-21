/**
 * サーバー側ゲームアクション
 *
 * クライアント側 state.ts は 'player' 固定だが、
 * サーバーは 4 人全員の操作を受け付けるため Position 引数で汎用化している。
 */
import type { GameState, Position, Tile, MatchState } from '@mahjong/shared';
import {
  TURN_ORDER, initMatchState,
  createDeck, shuffleDeck, sortHand,
  isAgari, isTenpai,
  detectYaku, hasValidYaku,
  calcScore,
  getParent,
} from '@mahjong/shared';

// ─── ユーティリティ ───────────────────────────────────
export function nextTurn(current: Position): Position {
  const idx = TURN_ORDER.indexOf(current);
  return TURN_ORDER[(idx + 1) % TURN_ORDER.length];
}

// ─── 指定プレイヤーへのツモ牌付与 ───────────────────────
// 山が尽きていれば ryukyoku に遷移する
function drawForPlayer(state: GameState, pos: Position): GameState {
  if (state.wall.length === 0) {
    return { ...state, phase: 'ryukyoku', drawnTile: null, currentTurn: pos };
  }
  const [drawn, ...restWall] = state.wall;
  return {
    ...state,
    wall: restWall,
    drawnTile: drawn,
    selectedIndex: null,
    phase: 'playerTurn',
    currentTurn: pos,
  };
}

// ─── ゲーム初期化 ─────────────────────────────────────
// オンライン版: 全プレイヤーの手牌を理牌してから配布する
export function initGameState(match?: MatchState): GameState {
  const currentMatch = match ?? initMatchState();
  const deck = shuffleDeck(createDeck());
  let idx = 0;

  const parentPos = getParent(currentMatch.round);
  const players = {} as GameState['players'];
  for (const pos of TURN_ORDER) {
    players[pos] = {
      position: pos,
      hand: sortHand(deck.slice(idx, idx + 13)),
      discards: [],
    };
    idx += 13;
  }

  const wall = deck.slice(idx);
  const drawnTile = wall.shift()!;
  const doraTile = wall.pop()!;
  const riichi: GameState['riichi'] = { player: false, simo: false, toimen: false, kami: false };

  return {
    wall,
    players,
    drawnTile,
    selectedIndex: null,
    phase: 'playerTurn',   // オンラインでは cpuTurn は使用しない
    currentTurn: parentPos,
    agariInfo: null,
    doraTile,
    riichi,
    match: currentMatch,
  };
}

// ─── 捨て牌処理 (任意 Position) ─────────────────────────
// index: -1=ツモ切り, 0-12=手牌から
export function discardTileAt(state: GameState, pos: Position, index: number): GameState {
  if (state.phase !== 'playerTurn' || state.currentTurn !== pos) return state;
  if (state.riichi[pos] && index !== -1) return state; // リーチ中はツモ切りのみ

  const playerState = state.players[pos];
  let newHand: Tile[];
  let discarded: Tile;

  if (index === -1) {
    if (!state.drawnTile) return state;
    discarded = state.drawnTile;
    newHand = [...playerState.hand];
  } else {
    if (index < 0 || index >= playerState.hand.length) return state;
    discarded = playerState.hand[index];
    newHand = [...playerState.hand];
    if (state.drawnTile) newHand.push(state.drawnTile);
    newHand.splice(index, 1);
    newHand = sortHand(newHand);
  }

  const newPlayers: GameState['players'] = {
    ...state.players,
    [pos]: {
      ...playerState,
      hand: newHand,
      discards: [...playerState.discards, discarded],
    },
  };

  const next = nextTurn(pos);
  return drawForPlayer({
    ...state,
    players: newPlayers,
    drawnTile: null,
    selectedIndex: null,
    currentTurn: next,
  }, next);
}

// ─── ツモ和了 (任意 Position) ────────────────────────────
export function declareTsumoAt(state: GameState, pos: Position): GameState {
  if (state.phase !== 'playerTurn' || state.currentTurn !== pos) return state;
  if (!state.drawnTile) return state;

  const hand = [...state.players[pos].hand, state.drawnTile];
  if (!isAgari(hand)) return state;

  const isRiichi = state.riichi[pos];
  const yakuList = detectYaku(hand, true, isRiichi, state.doraTile, pos);
  if (!hasValidYaku(yakuList)) return state;

  const isParent = getParent(state.match.round) === pos;
  const scoreResult = calcScore(yakuList, hand, true, isParent);

  return {
    ...state,
    phase: 'agari',
    agariInfo: {
      winner: pos,
      tile: state.drawnTile,
      isTsumo: true,
      yakuList,
      han: scoreResult.han,
      fu: scoreResult.fu,
      score: scoreResult.score,
      scoreDetail: scoreResult.scoreDetail,
    },
  };
}

// ─── リーチ宣言 (任意 Position) ──────────────────────────
// ツモ切りリーチのみ対応
export function declareRiichiAt(state: GameState, pos: Position): GameState {
  if (state.phase !== 'playerTurn' || state.currentTurn !== pos) return state;
  if (!state.drawnTile) return state;
  if (state.riichi[pos]) return state;
  if (!isTenpai(state.players[pos].hand)) return state;

  const playerState = state.players[pos];
  const discarded = state.drawnTile;

  const newPlayers: GameState['players'] = {
    ...state.players,
    [pos]: {
      ...playerState,
      discards: [...playerState.discards, discarded],
    },
  };

  const next = nextTurn(pos);
  return drawForPlayer({
    ...state,
    players: newPlayers,
    drawnTile: null,
    selectedIndex: null,
    riichi: { ...state.riichi, [pos]: true },
    currentTurn: next,
  }, next);
}
