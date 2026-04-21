import type { Tile, TileKind, HonorKey, Position } from '../types';

// 字牌の順序: 東南西北白発中
const HONOR_KEYS: HonorKey[] = ['e', 's', 'w', 'n', 'h', 'no', 'c'];

// ─── デッキ生成 (136枚) ──────────────────────────────
export function createDeck(): Tile[] {
  const tiles: Tile[] = [];
  let uid = 0;

  // 数牌: 萬子・筒子・索子 (1-9 × 4枚)
  const kinds: TileKind[] = ['manzu', 'pinzu', 'sozu'];
  for (const kind of kinds) {
    for (let num = 1; num <= 9; num++) {
      for (let copy = 0; copy < 4; copy++) {
        tiles.push({ kind, number: num, uid: uid++ });
      }
    }
  }

  // 字牌: 7種 × 4枚
  for (const honor of HONOR_KEYS) {
    for (let copy = 0; copy < 4; copy++) {
      tiles.push({ kind: 'tupai', honor, uid: uid++ });
    }
  }

  return tiles; // 合計136枚
}

// ─── Fisher-Yates シャッフル ─────────────────────────
export function shuffleDeck(deck: Tile[]): Tile[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ─── 手牌表示用画像パス (player視点・通常牌) ─────────────
export function getTileImagePath(tile: Tile): string {
  if (tile.kind === 'manzu') {
    return `/manzu/player/p_ms${tile.number}.gif`;
  }
  if (tile.kind === 'pinzu') {
    return `/pinzu/player/p_ps${tile.number}.gif`;
  }
  if (tile.kind === 'sozu') {
    return `/sozu/player/p_ss${tile.number}.gif`;
  }
  // 字牌: 発(no)だけファイル名が異なる
  if (tile.honor === 'no') {
    return `/tupai/player/p_no.gif`;
  }
  return `/tupai/player/p_ji_${tile.honor}.gif`;
}

// ─── 捨て牌画像パス (_furo.gif、方向別フォルダー) ────────
// pos: 'player' → player フォルダー
//      'kami'   → kami フォルダー (90°左回転済み)
//      'simo'   → simo フォルダー (90°右回転済み)
//      'toimen' → toimen フォルダー (180°回転済み)
export function getDiscardImagePath(tile: Tile, pos: Position): string {
  if (tile.kind === 'manzu') {
    return `/manzu/${pos}/p_ms${tile.number}_furo.gif`;
  }
  if (tile.kind === 'pinzu') {
    return `/pinzu/${pos}/p_ps${tile.number}_furo.gif`;
  }
  if (tile.kind === 'sozu') {
    return `/sozu/${pos}/p_ss${tile.number}_furo.gif`;
  }
  if (tile.honor === 'no') {
    return `/tupai/${pos}/p_no_furo.gif`;
  }
  return `/tupai/${pos}/p_ji_${tile.honor}_furo.gif`;
}
// ─── 理牌: 手牌をマンズ→ピンズ→ソーズ→字牌の順に並び替える ─────
// 数牌: 数字の小さい順, 字牌: 東→南→西→北→白→発→中
const KIND_ORDER: Record<TileKind, number> = { manzu: 0, pinzu: 1, sozu: 2, tupai: 3 };
const HONOR_ORDER: Record<HonorKey, number> = { e: 0, s: 1, w: 2, n: 3, h: 4, no: 5, c: 6 };

export function sortHand(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => {
    const kindDiff = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (kindDiff !== 0) return kindDiff;
    if (a.kind === 'tupai') return HONOR_ORDER[a.honor!] - HONOR_ORDER[b.honor!];
    return (a.number ?? 0) - (b.number ?? 0);
  });
}
// ─── 裏牌の画像パス取得 (CPU手牌・山) ───────────────────
export function getBackImagePath(position: Position): string {
  switch (position) {
    case 'kami':    return '/other/pai/p_bk_kami.gif';
    case 'toimen':  return '/other/pai/p_bk_toimen.gif';
    case 'simo':    return '/other/pai/p_bk_simo.gif';
    default:        return '/other/pai/p_bk_yama.gif';
  }
}

// ─── 牌の表示ラベル (alt テキスト用) ────────────────────
export function getTileLabel(tile: Tile): string {
  if (tile.kind === 'manzu') return `${tile.number}萬`;
  if (tile.kind === 'pinzu') return `${tile.number}筒`;
  if (tile.kind === 'sozu')  return `${tile.number}索`;
  const map: Record<HonorKey, string> = {
    e: '東', s: '南', w: '西', n: '北', h: '白', no: '発', c: '中',
  };
  return map[tile.honor!];
}
