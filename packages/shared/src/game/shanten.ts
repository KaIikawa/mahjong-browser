/**
 * 向聴数(シャンテン数)計算
 *
 * shanten(tiles) の戻り値:
 *   -1 : 和了 (agari)
 *    0 : テンパイ
 *    n : n向聴
 *
 * 対応形:
 *   - 通常手 (4面子1雀頭)
 *   - 七対子
 *   - 国士無双
 */

import type { Tile } from '../types';

// ─── 牌を番号に変換 (0-33 の整数) ─────────────────────
// 萬: 0-8, 筒: 9-17, 索: 18-26, 字牌: 27-33
function tileToNum(tile: Tile): number {
  if (tile.kind === 'manzu') return tile.number! - 1;        // 0-8
  if (tile.kind === 'pinzu') return 9 + tile.number! - 1;    // 9-17
  if (tile.kind === 'sozu')  return 18 + tile.number! - 1;   // 18-26
  const honorMap: Record<string, number> = {
    e: 27, s: 28, w: 29, n: 30, h: 31, no: 32, c: 33,
  };
  return honorMap[tile.honor!];
}

// ─── 手牌を枚数配列 (counts[0..33]) に変換 ─────────────
function toCounts(tiles: Tile[]): number[] {
  const counts = new Array<number>(34).fill(0);
  for (const t of tiles) counts[tileToNum(t)]++;
  return counts;
}

// ─── 国士無双向聴数 ─────────────────────────────────────
function kokushiShanten(counts: number[]): number {
  const terminals = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
  let kinds = 0;
  let hasPair = false;
  for (const i of terminals) {
    if (counts[i] > 0) {
      kinds++;
      if (counts[i] >= 2) hasPair = true;
    }
  }
  return 13 - kinds - (hasPair ? 1 : 0);
}

// ─── 七対子向聴数 ────────────────────────────────────────
function chiitoiShanten(counts: number[]): number {
  let pairs = 0;
  let kinds = 0;
  for (let i = 0; i < 34; i++) {
    if (counts[i] >= 1) kinds++;
    if (counts[i] >= 2) pairs++;
  }
  // 同種4枚は1対子のみカウント
  return 6 - pairs + Math.max(0, 7 - kinds);
}

// ─── 通常手向聴数 ────────────────────────────────────────
// counts: 34要素の枚数配列 (14枚を想定、雀頭固定後に呼ぶ)
// メンツ数, 部分メンツ(対子+両面等)数を数えて向聴数を計算する

function normalShanten(counts: number[]): number {
  let best = 8; // 最大向聴数は8
  // 雀頭を全候補から試す
  for (let pair = 0; pair < 34; pair++) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    const s = calcMentsu(counts, 0, 0, 0);
    best = Math.min(best, 8 - 2 * s[0] - s[1] - 1);
    counts[pair] += 2;
  }
  // 雀頭なしでも計算
  const s0 = calcMentsu(counts, 0, 0, 0);
  best = Math.min(best, 8 - 2 * s0[0] - s0[1]);
  return best;
}

// DFS でメンツ数・部分メンツ数の最大を返す
// [mentsu, partial]
function calcMentsu(
  counts: number[],
  idx: number,
  mentsu: number,
  partial: number,
): [number, number] {
  // インデックスをスキップ
  while (idx < 34 && counts[idx] === 0) idx++;
  if (idx >= 34) return [mentsu, partial];

  let best: [number, number] = [mentsu, partial];

  // 刻子(同種3枚)
  if (counts[idx] >= 3) {
    counts[idx] -= 3;
    const r = calcMentsu(counts, idx, mentsu + 1, partial);
    if (r[0] > best[0] || (r[0] === best[0] && r[1] > best[1])) best = r;
    counts[idx] += 3;
  }

  // 順子 (idx, idx+1, idx+2、字牌は不可)
  if (idx < 27 && (idx % 9) <= 6 && counts[idx] >= 1 && counts[idx + 1] >= 1 && counts[idx + 2] >= 1) {
    counts[idx]--;
    counts[idx + 1]--;
    counts[idx + 2]--;
    const r = calcMentsu(counts, idx, mentsu + 1, partial);
    if (r[0] > best[0] || (r[0] === best[0] && r[1] > best[1])) best = r;
    counts[idx]++;
    counts[idx + 1]++;
    counts[idx + 2]++;
  }

  // 対子 (部分メンツ)
  if (counts[idx] >= 2) {
    counts[idx] -= 2;
    const r = calcMentsu(counts, idx + 1, mentsu, partial + 1);
    if (r[0] > best[0] || (r[0] === best[0] && r[1] > best[1])) best = r;
    counts[idx] += 2;
  }

  // 両面/嵌張/辺張 (部分メンツ)
  if (idx < 27) {
    // idx + 1 が同スーツ内かチェック
    if ((idx % 9) <= 7 && counts[idx + 1] >= 1) {
      counts[idx]--;
      counts[idx + 1]--;
      const r = calcMentsu(counts, idx + 1, mentsu, partial + 1);
      if (r[0] > best[0] || (r[0] === best[0] && r[1] > best[1])) best = r;
      counts[idx]++;
      counts[idx + 1]++;
    }
    // idx + 2 が同スーツ内かチェック (嵌張)
    if ((idx % 9) <= 6 && counts[idx + 2] >= 1) {
      counts[idx]--;
      counts[idx + 2]--;
      const r = calcMentsu(counts, idx + 1, mentsu, partial + 1);
      if (r[0] > best[0] || (r[0] === best[0] && r[1] > best[1])) best = r;
      counts[idx]++;
      counts[idx + 2]++;
    }
  }

  // 何も取らずに次へ (使わない場合)
  const r2 = calcMentsu(counts, idx + 1, mentsu, partial);
  if (r2[0] > best[0] || (r2[0] === best[0] && r2[1] > best[1])) best = r2;

  return best;
}

// ─── メイン: 向聴数を返す ─────────────────────────────
// tiles: 手牌 + ツモ牌 (合計14枚) または手牌のみ (13枚)
export function calcShanten(tiles: Tile[]): number {
  const counts = toCounts(tiles);
  return Math.min(
    normalShanten(counts),
    chiitoiShanten(counts),
    kokushiShanten(counts),
  );
}

// ─── 便利関数 ──────────────────────────────────────────
export function isAgari(tiles: Tile[]): boolean {
  return calcShanten(tiles) === -1;
}

export function isTenpai(tiles: Tile[]): boolean {
  return calcShanten(tiles) === 0;
}
