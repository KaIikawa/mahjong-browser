/**
 * 役判定モジュール
 *
 * detectYaku(hand14, isTsumo, isRiichi, doraTile, winner) → YakuResult[]
 *
 * 対応役:
 *   - リーチ (1翻)
 *   - メンゼンツモ (1翻)
 *   - タンヤオ (1翻)
 *   - 役牌: 白/発/中/場風(東)/自風 (各1翻, 東家は東で連風牌2翻)
 *   - 七対子 (2翻)
 *   - ドラ (各1翻)
 */

import type { Tile, HonorKey, Position, YakuResult } from '../types';

// ─── 牌番号変換 (0-33) ───────────────────────────────
// 萬: 0-8, 筒: 9-17, 索: 18-26, 字牌: 27-33 (東南西北白発中)
export function tileToNum(tile: Tile): number {
  if (tile.kind === 'manzu') return tile.number! - 1;
  if (tile.kind === 'pinzu') return 9  + tile.number! - 1;
  if (tile.kind === 'sozu')  return 18 + tile.number! - 1;
  const m: Record<string, number> = { e: 27, s: 28, w: 29, n: 30, h: 31, no: 32, c: 33 };
  return m[tile.honor!];
}

// ─── 枚数配列 ───────────────────────────────────────
export function toCounts(tiles: Tile[]): number[] {
  const counts = new Array<number>(34).fill(0);
  for (const t of tiles) counts[tileToNum(t)]++;
  return counts;
}

// ─── ドラ表示牌 → 実ドラ番号 ────────────────────────
function doraNum(indicator: Tile): number {
  if (indicator.kind === 'manzu') {
    return indicator.number === 9 ? 0 : indicator.number!;        // 9m→1m
  }
  if (indicator.kind === 'pinzu') {
    return indicator.number === 9 ? 9 : 9 + indicator.number!;    // 9p→1p
  }
  if (indicator.kind === 'sozu') {
    return indicator.number === 9 ? 18 : 18 + indicator.number!;  // 9s→1s
  }
  // 字牌: 東→南→西→北→東, 白→発→中→白
  const cycle: Record<HonorKey, number> = { e: 28, s: 29, w: 30, n: 27, h: 32, no: 33, c: 31 };
  return cycle[indicator.honor!];
}

export function countDora(tiles: Tile[], indicator: Tile): number {
  const dn = doraNum(indicator);
  return tiles.filter(t => tileToNum(t) === dn).length;
}

// ─── 七対子 ─────────────────────────────────────────
export function isChiitoi(tiles: Tile[]): boolean {
  const counts = toCounts(tiles);
  return (
    counts.filter(c => c === 2).length === 7 &&
    counts.filter(c => c > 0).length === 7
  );
}

// ─── タンヤオ ────────────────────────────────────────
function isTanyao(tiles: Tile[]): boolean {
  return tiles.every(t => t.kind !== 'tupai' && t.number! >= 2 && t.number! <= 8);
}

// ─── 役牌チェック ────────────────────────────────────
// 場風=東(固定), 自風は winner の座席による
// 東家(player)は場風+自風で連風牌(2翻)
function yakuhaiList(counts: number[], winner: Position): YakuResult[] {
  const result: YakuResult[] = [];

  // 三元牌
  if (counts[31] >= 3) result.push({ name: '白',   han: 1 });
  if (counts[32] >= 3) result.push({ name: '発',   han: 1 });
  if (counts[33] >= 3) result.push({ name: '中',   han: 1 });

  // 場風: 東 (全員共通)
  if (counts[27] >= 3) result.push({ name: '場風（東）', han: 1 });

  // 自風 (東以外のみ別途追加: 東家はすでに場風で+1)
  const selfWindMap: Record<Position, { num: number; name: string }> = {
    player: { num: 27, name: '自風（東）' }, // 東家: 場風東と同じ牌 → 連風牌で2翻
    simo:   { num: 28, name: '自風（南）' },
    toimen: { num: 29, name: '自風（西）' },
    kami:   { num: 30, name: '自風（北）' },
  };
  const sw = selfWindMap[winner];
  if (sw.num !== 27 && counts[sw.num] >= 3) {
    // 東以外の自風
    result.push({ name: sw.name, han: 1 });
  } else if (sw.num === 27 && counts[27] >= 3) {
    // 東家: 場風東で既に追加済み → 連風として自風分を追加
    result.push({ name: '自風（東）', han: 1 });
  }

  return result;
}

// ─── 役判定メイン ────────────────────────────────────
// hand14  : 14枚の和了手牌 (ツモ牌含む)
// isTsumo : ツモ和了か
// isRiichi: リーチ中か
// doraTile: ドラ表示牌 (null の場合ドラなし)
// winner  : 和了プレイヤー (自風判定用)
export function detectYaku(
  hand14: Tile[],
  isTsumo: boolean,
  isRiichi: boolean,
  doraTile: Tile | null,
  winner: Position,
): YakuResult[] {
  const counts = toCounts(hand14);
  const chiitoi = isChiitoi(hand14);
  const yaku: YakuResult[] = [];

  // リーチ
  if (isRiichi) yaku.push({ name: 'リーチ', han: 1 });

  // メンゼンツモ (リーチあり/なし問わず)
  if (isTsumo) yaku.push({ name: 'メンゼンツモ', han: 1 });

  // 七対子
  if (chiitoi) {
    yaku.push({ name: '七対子', han: 2 });
  } else {
    // 役牌 (七対子は刻子でなく対子なので対象外)
    yaku.push(...yakuhaiList(counts, winner));
  }

  // タンヤオ
  if (isTanyao(hand14)) yaku.push({ name: 'タンヤオ', han: 1 });

  // ドラ
  if (doraTile !== null) {
    const d = countDora(hand14, doraTile);
    if (d > 0) yaku.push({ name: d === 1 ? 'ドラ' : `ドラ${d}`, han: d });
  }

  return yaku;
}

// ─── 役あり判定 (ドラのみ和了不可) ─────────────────────
// ドラを除いた翻が1以上あれば有効な和了
export function hasValidYaku(yakuList: YakuResult[]): boolean {
  return yakuList.some(y => !y.name.startsWith('ドラ'));
}
