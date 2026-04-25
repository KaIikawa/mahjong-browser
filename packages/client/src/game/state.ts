import type { GameState, Position, Tile, MatchState } from '@mahjong/shared';
import { TURN_ORDER, initMatchState } from '@mahjong/shared';
import { createDeck, shuffleDeck, sortHand } from '@mahjong/shared';
import { calcShanten, isAgari, isTenpai } from '@mahjong/shared';
import { detectYaku, hasValidYaku } from '@mahjong/shared';
import { calcScore } from '@mahjong/shared';
import { getParent } from '@mahjong/shared';

// ─── ゲーム初期化 ────────────────────────────────────
// match: 対局状態 (初回は initMatchState() を渡す)
// 配牌: 各プレイヤー13枚, 親が最初にツモ (14枚目)
export function initGameState(match?: MatchState): GameState {
  const currentMatch = match ?? initMatchState();
  const deck = shuffleDeck(createDeck()); // 136枚シャッフル
  let idx = 0;

  // 親の座席 (局番号から決定)
  const parentPos = getParent(currentMatch.round);

  const players = {} as GameState['players'];
  for (const pos of TURN_ORDER) {
    players[pos] = {
      position: pos,
      // 自分の手牌は配牌時に理牌する
      hand: pos === 'player' ? sortHand(deck.slice(idx, idx + 13)) : deck.slice(idx, idx + 13),
      discards: [],
    };
    idx += 13; // 52枚配布
  }

  // 山: 残り84枚, そこから親が最初にツモ
  const wall = deck.slice(idx);
  const drawnTile = wall.shift()!; // 壁から1枚 → 山は83枚

  // ドラ表示牌: 末尾から1枚 (王牌エリアに相当)
  const doraTile = wall.pop()!; // 82枚残る

  // リーチ状態: 全員false
  const riichi: GameState['riichi'] = { player: false, simo: false, toimen: false, kami: false };

  return {
    wall,
    players,
    drawnTile,
    selectedIndex: null,
    phase: parentPos === 'player' ? 'playerTurn' : 'cpuTurn',
    currentTurn: parentPos,
    agariInfo: null,
    doraTile,
    riichi,
    match: currentMatch,
    playerNames: { player: 'あなた', simo: 'CPU南', toimen: 'CPU西', kami: 'CPU北' },
    waitingRon: null,
  };
}

// ─── 次の手番プレイヤーを返す ────────────────────────
function nextTurn(current: Position): Position {
  const idx = TURN_ORDER.indexOf(current);
  return TURN_ORDER[(idx + 1) % TURN_ORDER.length];
}

// ─── 手牌/ツモ牌の選択 ──────────────────────────────
// index: 0-12=手牌, -1=ツモ牌
export function selectTile(state: GameState, index: number): GameState {
  if (state.phase !== 'playerTurn') return state;
  // リーチ中は手牌選択不可 (ツモ切りのみ)
  if (state.riichi['player'] && index !== -1) return state;
  if (state.selectedIndex === index) {
    return { ...state, selectedIndex: null };
  }
  return { ...state, selectedIndex: index };
}

// ─── プレイヤーのツモ和了 ────────────────────────────
export function declareTsumo(state: GameState): GameState {
  if (state.phase !== 'playerTurn' || !state.drawnTile) return state;
  const hand = [...state.players['player'].hand, state.drawnTile];
  if (!isAgari(hand)) return state;

  const isRiichi = state.riichi['player'];
  const yakuList = detectYaku(hand, true, isRiichi, state.doraTile, 'player');
  if (!hasValidYaku(yakuList)) return state;

  const isParent = getParent(state.match.round) === 'player';
  const scoreResult = calcScore(yakuList, hand, true, isParent);
  return {
    ...state,
    phase: 'agari',
    agariInfo: {
      winner: 'player',
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

// ─── リーチ宣言 ────────────────────────────────────
// 13枚手牌がテンパイのときのみ有効。ツモ切りしてリーチフラグを立てる
export function declareRiichi(state: GameState): GameState {
  if (state.phase !== 'playerTurn' || !state.drawnTile) return state;
  if (state.riichi['player']) return state; // 既にリーチ済み
  if (!isTenpai(state.players['player'].hand)) return state; // テンパイでなければ不可

  const player = state.players['player'];
  const discarded = state.drawnTile; // ツモ切り

  const newPlayers: GameState['players'] = {
    ...state.players,
    player: {
      ...player,
      discards: [...player.discards, discarded],
    },
  };

  const next = nextTurn('player');
  const newState: GameState = {
    ...state,
    players: newPlayers,
    drawnTile: null,
    selectedIndex: null,
    phase: 'cpuTurn',
    currentTurn: next,
    riichi: { ...state.riichi, player: true },
  };

  // 次がプレイヤーならツモ牌を先に引いておく
  return nextState(newState, next);
}

// ─── プレイヤー捨て牌処理 ────────────────────────────
// index: 0-12=手牌から捨てる, -1=ツモ牌を捨てる
export function discardTile(state: GameState, index: number): GameState {
  if (state.phase !== 'playerTurn') return state;
  // リーチ中はツモ切りのみ
  if (state.riichi['player'] && index !== -1) return state;

  const player = state.players['player'];
  let newHand: Tile[];
  let discarded: Tile;

  if (index === -1) {
    if (!state.drawnTile) return state;
    discarded = state.drawnTile;
    newHand = [...player.hand]; // ツモ牌を捨てる場合は手牌そのまま (既にソート済み)
  } else {
    if (index < 0 || index >= player.hand.length) return state;
    discarded = player.hand[index];
    newHand = [...player.hand];
    if (state.drawnTile) {
      newHand.push(state.drawnTile);
    }
    newHand.splice(index, 1);
    // 手牌に引いた牌を組み込んだあと再理牌
    newHand = sortHand(newHand);
  }

  const newPlayers: GameState['players'] = {
    ...state.players,
    player: {
      ...player,
      hand: newHand,
      discards: [...player.discards, discarded],
    },
  };

  // 次の手番へ (下家=simo のCPUターン)
  const next = nextTurn('player');
  return {
    ...state,
    players: newPlayers,
    drawnTile: null,
    selectedIndex: null,
    phase: 'cpuTurn',
    currentTurn: next,
  };
}

// ─── CPU の1手: ツモ → ランダム捨て ─────────────────
// 呼び出し後に次の状態を返す。プレイヤーのターンに戻る場合は 'playerTurn' になる
export function cpuDrawAndDiscard(state: GameState): GameState {
  if (state.phase !== 'cpuTurn') return state;

  const pos = state.currentTurn;

  // 山が尽きた → 流局
  if (state.wall.length === 0) {
    return { ...state, phase: 'ryukyoku', drawnTile: null };
  }

  // ツモ
  const [drawn, ...restWall] = state.wall;
  const cpuPlayer = state.players[pos];

  // CPU ツモ和了チェック
  const cpuFullHand = [...cpuPlayer.hand, drawn];
  if (isAgari(cpuFullHand)) {
    const isParent = getParent(state.match.round) === pos;
    const yakuList  = detectYaku(cpuFullHand, true, false, state.doraTile, pos);
    const scoreResult = calcScore(yakuList, cpuFullHand, true, isParent);
    return {
      ...state,
      wall: restWall,
      phase: 'agari',
      agariInfo: {
        winner: pos,
        tile: drawn,
        isTsumo: true,
        yakuList,
        han: scoreResult.han,
        fu: scoreResult.fu,
        score: scoreResult.score,
        scoreDetail: scoreResult.scoreDetail,
      },
    };
  }

  // ランダムに1枚捨てる (引いた牌込みの14枚から選ぶ)
  const fullHand = [...cpuPlayer.hand, drawn]; // 14枚
  const discardIdx = Math.floor(Math.random() * fullHand.length);
  const discarded = fullHand[discardIdx];
  const newHand = fullHand.filter((_, i) => i !== discardIdx); // 13枚

  const newPlayers: GameState['players'] = {
    ...state.players,
    [pos]: {
      ...cpuPlayer,
      hand: newHand,
      discards: [...cpuPlayer.discards, discarded],
    },
  };

  const afterDiscard: GameState = {
    ...state,
    players: newPlayers,
    wall: restWall,
    drawnTile: null,
    selectedIndex: null,
  };

  // プレイヤー (自分) がロン可能か確認
  const playerHand = state.players['player'].hand;
  const playerFullHand = [...playerHand, discarded];
  if (isAgari(playerFullHand)) {
    const isRiichi = state.riichi['player'];
    const yakuList = detectYaku(playerFullHand, false, isRiichi, state.doraTile, 'player');
    if (hasValidYaku(yakuList)) {
      const nextPos = nextTurn(pos);
      return {
        ...afterDiscard,
        phase: 'waitingRon',
        waitingRon: { discarder: pos, tile: discarded, candidates: ['player'] },
        currentTurn: nextPos,
      };
    }
  }

  return nextState(afterDiscard, nextTurn(pos));
}

// ─── 次の手番に遷移する (山ツモ含む) ───────────────
function nextState(state: GameState, next: Position): GameState {
  if (next === 'player') {
    if (state.wall.length === 0) {
      return { ...state, phase: 'ryukyoku', drawnTile: null, currentTurn: 'player' };
    }
    const [playerDraw, ...finalWall] = state.wall;
    return {
      ...state,
      wall: finalWall,
      drawnTile: playerDraw,
      selectedIndex: null,
      phase: 'playerTurn',
      currentTurn: 'player',
    };
  }
  // 次もCPUターン
  return {
    ...state,
    drawnTile: null,
    selectedIndex: null,
    phase: 'cpuTurn',
    currentTurn: next,
  };
}

// ─── ロン和了 (プレイヤーのみ) ───────────────────────
export function declareRon(state: GameState): GameState {
  if (state.phase !== 'waitingRon' || !state.waitingRon) return state;
  if (!state.waitingRon.candidates.includes('player')) return state;

  const tile = state.waitingRon.tile;
  const hand = [...state.players['player'].hand, tile];
  const isRiichi = state.riichi['player'];
  const yakuList = detectYaku(hand, false, isRiichi, state.doraTile, 'player');
  if (!hasValidYaku(yakuList)) return state;

  const isParent = getParent(state.match.round) === 'player';
  const scoreResult = calcScore(yakuList, hand, false, isParent);

  return {
    ...state,
    phase: 'agari',
    waitingRon: null,
    agariInfo: {
      winner: 'player',
      tile,
      isTsumo: false,
      yakuList,
      han: scoreResult.han,
      fu: scoreResult.fu,
      score: scoreResult.score,
      scoreDetail: scoreResult.scoreDetail,
    },
  };
}

// ─── ロンキャンセル (プレイヤーのみ) ─────────────────
// 見逃し: 次の CPU ターンへ進む
export function cancelRon(state: GameState): GameState {
  if (state.phase !== 'waitingRon' || !state.waitingRon) return state;
  return nextState({ ...state, waitingRon: null }, state.currentTurn);
}

// ─── [デバッグ用] 指定シャンテン数の配牌で初期化 ────────
// targetShanten: 0=聴牌, 1=1向聴, 2=2向聴, -1=ランダム(制約なし)
// 条件を満たす手牌が生成されるまで最大100回リトライする
export function initGameStateWithShanten(targetShanten: number, match?: MatchState): GameState {
  if (targetShanten < 0) return initGameState(match);
  for (let i = 0; i < 100; i++) {
    const state = initGameState(match);
    if (calcShanten(state.players['player'].hand) === targetShanten) return state;
  }
  return initGameState(match);
}

// ─── [デバッグ用] CPU が指定UID の牌を捨てる ───────────
// cpuDrawAndDiscard と同じ流れだが、ランダム捨てを discardUid 指定に変える
// discardUid が -1 または見つからない場合はランダム捨て
export function cpuDrawAndDiscardAt(state: GameState, discardUid: number): GameState {
  if (state.phase !== 'cpuTurn') return state;

  const pos = state.currentTurn;

  if (state.wall.length === 0) {
    return { ...state, phase: 'ryukyoku', drawnTile: null };
  }

  const [drawn, ...restWall] = state.wall;
  const cpuPlayer = state.players[pos];

  // ツモ和了チェック
  const cpuFullHand = [...cpuPlayer.hand, drawn];
  if (isAgari(cpuFullHand)) {
    const isParent = getParent(state.match.round) === pos;
    const yakuList  = detectYaku(cpuFullHand, true, false, state.doraTile, pos);
    const scoreResult = calcScore(yakuList, cpuFullHand, true, isParent);
    return {
      ...state,
      wall: restWall,
      phase: 'agari',
      agariInfo: {
        winner: pos,
        tile: drawn,
        isTsumo: true,
        yakuList,
        han: scoreResult.han,
        fu: scoreResult.fu,
        score: scoreResult.score,
        scoreDetail: scoreResult.scoreDetail,
      },
    };
  }

  // 指定 UID の牌を捨てる (見つからなければランダム)
  const fullHand = cpuFullHand; // 14枚
  const specifiedIdx = discardUid >= 0 ? fullHand.findIndex(t => t.uid === discardUid) : -1;
  const discardIdx = specifiedIdx >= 0 ? specifiedIdx : Math.floor(Math.random() * fullHand.length);
  const discarded = fullHand[discardIdx];
  const newHand = fullHand.filter((_, i) => i !== discardIdx);

  const newPlayers: GameState['players'] = {
    ...state.players,
    [pos]: {
      ...cpuPlayer,
      hand: newHand,
      discards: [...cpuPlayer.discards, discarded],
    },
  };

  const afterDiscard: GameState = {
    ...state,
    players: newPlayers,
    wall: restWall,
    drawnTile: null,
    selectedIndex: null,
  };

  // プレイヤーのロン確認
  const playerHand = state.players['player'].hand;
  const playerFullHand = [...playerHand, discarded];
  if (isAgari(playerFullHand)) {
    const isRiichi = state.riichi['player'];
    const yakuList = detectYaku(playerFullHand, false, isRiichi, state.doraTile, 'player');
    if (hasValidYaku(yakuList)) {
      const nextPos = nextTurn(pos);
      return {
        ...afterDiscard,
        phase: 'waitingRon',
        waitingRon: { discarder: pos, tile: discarded, candidates: ['player'] },
        currentTurn: nextPos,
      };
    }
  }

  return nextState(afterDiscard, nextTurn(pos));
}

// ─── [デバッグ用] 指定手牌で初期化 ─────────────────────
// hand: プレイヤーの初期手牌 (13枚)。残りは山から配布される
export function initGameStateWithHand(hand: Tile[], match?: MatchState): GameState {
  const currentMatch = match ?? initMatchState();
  const handUids = new Set(hand.map(t => t.uid));

  // 指定手牌を除いた残りのデッキをシャッフル
  const remaining = shuffleDeck(createDeck().filter(t => !handUids.has(t.uid)));
  let idx = 0;

  const parentPos = getParent(currentMatch.round);
  const players = {} as GameState['players'];
  for (const pos of TURN_ORDER) {
    if (pos === 'player') {
      players[pos] = { position: pos, hand: sortHand([...hand]), discards: [] };
    } else {
      players[pos] = { position: pos, hand: remaining.slice(idx, idx + 13), discards: [] };
      idx += 13;
    }
  }

  const wall = remaining.slice(idx);
  const drawnTile = parentPos === 'player' ? wall.shift()! : null;
  const doraTile = wall.pop()!;
  const riichi: GameState['riichi'] = { player: false, simo: false, toimen: false, kami: false };

  return {
    wall,
    players,
    drawnTile,
    selectedIndex: null,
    phase: parentPos === 'player' ? 'playerTurn' : 'cpuTurn',
    currentTurn: parentPos,
    agariInfo: null,
    doraTile,
    riichi,
    match: currentMatch,
    playerNames: { player: 'あなた', simo: 'CPU南', toimen: 'CPU西', kami: 'CPU北' },
    waitingRon: null,
  };
}
