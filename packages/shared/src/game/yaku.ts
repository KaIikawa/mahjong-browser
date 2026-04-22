/**
 * 役判定モジュール
 *
 * detectYaku(hand14, isTsumo, isRiichi, doraTile, winner) → YakuResult[]
 *
 * 対応役:
 *   [1翻]
 *     - リーチ
 *     - メンゼンツモ
 *     - タンヤオ
 *     - 役牌 (白/発/中/場風(東)/自風, 東家東は連風牌2翻)
 *     - 平和
 *     - 一盃口
 *     - ドラ (各1翻)
 *   [2翻]
 *     - 七対子
 *     - 対々和
 *     - 小三元
 *     - 混老頭
 *     - 全帯么九
 *     - 三色同刻
 *     - 三色同順
 *     - 一気通貫
 *     - 三暗刻
 *   [3翻]
 *     - 混一色
 *     - 二盃口
 *     - 純全帯么九
 *   [6翻]
 *     - 清一色
 *   [役満]
 *     - 四暗刻
 *     - 大三元
 *     - 国士無双
 *     - 字一色
 *     - 清老頭
 *     - 緑一色
 *     - 小四喜
 *     - 九連宝燈
 *   [ダブル役満]
 *     - 大四喜
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

// ═══ 面子分解 DFS ════════════════════════════════════
// 4面子1雀頭の全分解パターンを列挙する

type Mentsu = { type: 'seq' | 'tri'; start: number };
type Decomp  = { pair: number; mentsu: Mentsu[] };

function dfsDecomp(
  counts: number[],
  idx: number,
  current: Mentsu[],
  results: Decomp[],
  pair: number,
): void {
  while (idx < 34 && counts[idx] === 0) idx++;
  if (idx >= 34) {
    if (current.length === 4) results.push({ pair, mentsu: [...current] });
    return;
  }
  // 刻子
  if (counts[idx] >= 3) {
    counts[idx] -= 3;
    current.push({ type: 'tri', start: idx });
    dfsDecomp(counts, idx, current, results, pair);
    current.pop();
    counts[idx] += 3;
  }
  // 順子 (字牌不可, 色をまたがない)
  if (idx < 27 && idx % 9 <= 6 && counts[idx] >= 1 && counts[idx + 1] >= 1 && counts[idx + 2] >= 1) {
    counts[idx]--; counts[idx + 1]--; counts[idx + 2]--;
    current.push({ type: 'seq', start: idx });
    dfsDecomp(counts, idx, current, results, pair);
    current.pop();
    counts[idx]++; counts[idx + 1]++; counts[idx + 2]++;
  }
}

// 14枚から全面子分解を列挙する
function decompAll(counts: number[]): Decomp[] {
  const results: Decomp[] = [];
  for (let pair = 0; pair < 34; pair++) {
    if (counts[pair] < 2) continue;
    counts[pair] -= 2;
    dfsDecomp(counts, 0, [], results, pair);
    counts[pair] += 2;
  }
  return results;
}

// ─── 対々和 ─────────────────────────────────────────
function isToitoi(tiles: Tile[]): boolean {
  const counts = toCounts(tiles);
  const pairs = counts.filter(c => c === 2).length;
  const trips = counts.filter(c => c === 3).length;
  return pairs === 1 && trips === 4;
}

// ─── 混一色 / 清一色 ─────────────────────────────────
// 数牌種類数と字牌有無で判定
function suiteInfo(tiles: Tile[]): { suiteCount: number; hasTupai: boolean } {
  const hasManzu = tiles.some(t => t.kind === 'manzu');
  const hasPinzu = tiles.some(t => t.kind === 'pinzu');
  const hasSozu  = tiles.some(t => t.kind === 'sozu');
  const hasTupai = tiles.some(t => t.kind === 'tupai');
  const suiteCount = [hasManzu, hasPinzu, hasSozu].filter(Boolean).length;
  return { suiteCount, hasTupai };
}

// 数牌1種類 + 字牌あり
function isHonitsu(tiles: Tile[]): boolean {
  const { suiteCount, hasTupai } = suiteInfo(tiles);
  return suiteCount === 1 && hasTupai;
}

// 数牌1種類のみ (字牌なし)
function isChinitsu(tiles: Tile[]): boolean {
  const { suiteCount, hasTupai } = suiteInfo(tiles);
  return suiteCount === 1 && !hasTupai;
}

// ─── 小三元 ─────────────────────────────────────────
// 三元牌(白・発・中)のうち2種を刻子、1種を雀頭
function isShousangen(counts: number[]): boolean {
  const dragons = [counts[31], counts[32], counts[33]];
  const trips = dragons.filter(c => c >= 3).length;
  const pairs = dragons.filter(c => c === 2).length;
  return trips === 2 && pairs === 1;
}

// ─── 混老頭 ─────────────────────────────────────────
// 全牌が么九牌 (1・9・字牌) で構成される
function isHonroutou(tiles: Tile[]): boolean {
  return tiles.every(
    t => t.kind === 'tupai' || t.number === 1 || t.number === 9,
  );
}

// ─── 全帯么九 ────────────────────────────────────────
// 全面子・雀頭に必ず么九牌 (1・9・字牌) が含まれる
// 順子なら start が 0/7 (1/7始まり), 刻子/雀頭なら 0,8,9,17,18,26,27-33 のみ
// 混老頭・純全帯么九と複合しない (上位役優先は detectYaku 側で制御)
function isChanta(decomps: Decomp[]): boolean {
  // 么九牌の番号: 1m=0,9m=8,1p=9,9p=17,1s=18,9s=26,字牌=27-33
  const isYaochuNum = (n: number) =>
    n === 0 || n === 8 || n === 9 || n === 17 || n === 18 || n === 26 || n >= 27;

  return decomps.some(d => {
    // 雀頭が么九牌か
    if (!isYaochuNum(d.pair)) return false;
    // 全面子に么九牌が含まれるか
    return d.mentsu.every(m => {
      if (m.type === 'tri') return isYaochuNum(m.start);
      // 順子: start(=1牌目) か start+2(=3牌目) が么九牌
      return isYaochuNum(m.start) || isYaochuNum(m.start + 2);
    });
  });
}

// ─── 三色同刻 ────────────────────────────────────────
// 萬・筒・索で同じ数字の刻子が揃う (数字1-9)
function isSanshokudoukou(counts: number[]): boolean {
  for (let n = 0; n < 9; n++) {
    if (counts[n] >= 3 && counts[9 + n] >= 3 && counts[18 + n] >= 3) return true;
  }
  return false;
}

// ─── 三色同順 ────────────────────────────────────────
// 萬・筒・索で同じ数字始まりの順子が揃う
// 例: 123m + 123p + 123s → start%9 が同じ順子が3色ぶん存在する
function isSanshokudoujun(decomps: Decomp[]): boolean {
  return decomps.some(d => {
    const seqs = d.mentsu.filter(m => m.type === 'seq');
    for (const s of seqs) {
      const offset = s.start % 9;
      const hasM = seqs.some(x => x.start === offset);        // 萬 base=0
      const hasP = seqs.some(x => x.start === 9  + offset);   // 筒 base=9
      const hasS = seqs.some(x => x.start === 18 + offset);   // 索 base=18
      if (hasM && hasP && hasS) return true;
    }
    return false;
  });
}

// ─── 一気通貫 ────────────────────────────────────────
// 同一色で 1-2-3・4-5-6・7-8-9 の3順子が揃う
function isIttsu(counts: number[]): boolean {
  // 萬 (0-8), 筒 (9-17), 索 (18-26) それぞれについてチェック
  for (const base of [0, 9, 18]) {
    if (
      counts[base]   >= 1 && counts[base+1] >= 1 && counts[base+2] >= 1 &&
      counts[base+3] >= 1 && counts[base+4] >= 1 && counts[base+5] >= 1 &&
      counts[base+6] >= 1 && counts[base+7] >= 1 && counts[base+8] >= 1
    ) return true;
  }
  return false;
}

// ─── 三暗刻 ─────────────────────────────────────────
// 3種類以上の牌が3枚以上 (暗刻が3つ以上)
function isSanAnkou(counts: number[]): boolean {
  return counts.filter(c => c >= 3).length >= 3;
}

// ─── 一盃口 ─────────────────────────────────────────
// 同じ順子が2組ある (七対子とは複合しない)
function isIipeikou(decomps: Decomp[]): boolean {
  return decomps.some(d => {
    const seqs = d.mentsu.filter(m => m.type === 'seq').map(m => m.start);
    const seen = new Set<number>();
    for (const s of seqs) {
      if (seen.has(s)) return true;
      seen.add(s);
    }
    return false;
  });
}

// ─── 純全帯么九 ──────────────────────────────────────
// 全面子・雀頭に数牌の1か9のみが含まれる (字牌なし)
// 全帯么九の上位役 (複合しない)
function isJunchan(decomps: Decomp[]): boolean {
  const isTerminal = (n: number) =>
    n === 0 || n === 8 || n === 9 || n === 17 || n === 18 || n === 26;

  return decomps.some(d => {
    // 字牌があればNG
    if (d.pair >= 27) return false;
    if (d.mentsu.some(m => m.start >= 27)) return false;
    // 雀頭が端牌か
    if (!isTerminal(d.pair)) return false;
    // 全面子に端牌が含まれるか
    return d.mentsu.every(m => {
      if (m.type === 'tri') return isTerminal(m.start);
      // 順子: start(1牌目) か start+2(3牌目) が端牌
      return isTerminal(m.start) || isTerminal(m.start + 2);
    });
  });
}

// ─── 平和 ────────────────────────────────────────────
// 全面子が順子 + 雀頭が役牌でない (七対子とは複合しない)
// ※ 和了牌情報なしのため両面待ち判定は省略
function isPinfu(decomps: Decomp[], winner: Position): boolean {
  const selfWindNum: Record<Position, number> = { player: 27, simo: 28, toimen: 29, kami: 30 };
  const selfWind = selfWindNum[winner];

  return decomps.some(d => {
    // 全面子が順子
    if (d.mentsu.some(m => m.type === 'tri')) return false;
    // 雀頭が役牌でない: 三元牌(31-33)・場風東(27)・自風 はNG
    const p = d.pair;
    if (p >= 31) return false;           // 三元牌
    if (p === 27) return false;          // 東 (場風, かつ player の自風)
    if (p === selfWind) return false;    // 自風
    return true;
  });
}

// ─── 二盃口 ─────────────────────────────────────────
// 同じ順子が2種類×各2組 (全4面子が順子で AABB 形)
// 一盃口と複合しない (二盃口優先)
function isRyanpeikou(decomps: Decomp[]): boolean {
  return decomps.some(d => {
    if (d.mentsu.some(m => m.type === 'tri')) return false; // 刻子があればNG
    const seqCounts = new Map<number, number>();
    for (const m of d.mentsu) {
      seqCounts.set(m.start, (seqCounts.get(m.start) ?? 0) + 1);
    }
    const vals = [...seqCounts.values()];
    return vals.length === 2 && vals.every(v => v === 2);
  });
}

// ═══ 役満判定 ═════════════════════════════════════════

// ─── 大三元 ─────────────────────────────────────────
// 白・発・中 すべてが刻子 (3枚以上)
function isDaisangen(counts: number[]): boolean {
  return counts[31] >= 3 && counts[32] >= 3 && counts[33] >= 3;
}

// ─── 四暗刻 ─────────────────────────────────────────
// 4種類の牌が3枚以上 (4暗刻+1雀頭)
function isSuuankou(counts: number[]): boolean {
  return counts.filter(c => c >= 3).length >= 4;
}

// ─── 国士無双 ────────────────────────────────────────
// 13種の么九牌 (1m9m1p9p1s9s東南西北白発中) がすべて1枚以上
const KOKUSHI_TILES = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33] as const;
function isKokushi(counts: number[]): boolean {
  return KOKUSHI_TILES.every(i => counts[i] >= 1);
}

// ─── 字一色 ─────────────────────────────────────────
// 全牌が字牌 (東南西北白発中) のみ
function isTsuuiisou(tiles: Tile[]): boolean {
  return tiles.every(t => t.kind === 'tupai');
}

// ─── 清老頭 ─────────────────────────────────────────
// 全牌が数牌の1か9のみ (字牌なし)
function isChinroutou(tiles: Tile[]): boolean {
  return tiles.every(t => t.kind !== 'tupai' && (t.number === 1 || t.number === 9));
}

// ─── 緑一色 ─────────────────────────────────────────
// 全牌が索子2・3・4・6・8 または 発 のみ
// 牌番号: 2s=19, 3s=20, 4s=21, 6s=23, 8s=25, 発=32
const RYUUIISOU_NUMS = new Set([19, 20, 21, 23, 25, 32]);
function isRyuuiisou(counts: number[]): boolean {
  for (let i = 0; i < 34; i++) {
    if (counts[i] > 0 && !RYUUIISOU_NUMS.has(i)) return false;
  }
  return true;
}

// ─── 九連宝燈 ────────────────────────────────────────
// 同一色で 1112345678999 の形
// 条件: counts[base+0]>=3, counts[base+8]>=3, counts[base+1..7]>=1 が1色だけ
function isChuuren(counts: number[]): boolean {
  for (const base of [0, 9, 18]) {
    if (
      counts[base]   >= 3 &&
      counts[base+1] >= 1 && counts[base+2] >= 1 && counts[base+3] >= 1 &&
      counts[base+4] >= 1 && counts[base+5] >= 1 && counts[base+6] >= 1 &&
      counts[base+7] >= 1 &&
      counts[base+8] >= 3 &&
      // 合計14枚かつこの色のみ (字牌なし・他色なし)
      counts.slice(base, base + 9).reduce((a, b) => a + b, 0) === 14
    ) return true;
  }
  return false;
}

// ─── 四喜和 ──────────────────────────────────────────
// 東(27)・南(28)・西(29)・北(30)
// 大四喜: 4風すべて刻子 (ダブル役満 han:26)
// 小四喜: 3風刻子 + 1風雀頭 (役満 han:13)
function suuShiType(counts: number[]): 'daisushi' | 'shousushi' | null {
  const winds = [27, 28, 29, 30];
  const trips = winds.filter(w => counts[w] >= 3).length;
  const pairs = winds.filter(w => counts[w] === 2).length;
  if (trips === 4)              return 'daisushi';
  if (trips === 3 && pairs === 1) return 'shousushi';
  return null;
}

// ─── 役満リスト (成立すれば通常役を上書きして返す) ─────
function yakumanList(counts: number[], tiles: Tile[]): YakuResult[] | null {
  const result: YakuResult[] = [];
  if (isSuuankou(counts))   result.push({ name: '四暗刻',  han: 13 });
  if (isDaisangen(counts))  result.push({ name: '大三元',  han: 13 });
  if (isKokushi(counts))    result.push({ name: '国士無双', han: 13 });
  if (isTsuuiisou(tiles))   result.push({ name: '字一色',  han: 13 });
  if (isChinroutou(tiles))  result.push({ name: '清老頭',  han: 13 });
  if (isRyuuiisou(counts))  result.push({ name: '緑一色',  han: 13 });
  if (isChuuren(counts))    result.push({ name: '九連宝燈', han: 13 });
  const sushi = suuShiType(counts);
  if (sushi === 'daisushi')  result.push({ name: '大四喜',  han: 26 }); // ダブル役満
  if (sushi === 'shousushi') result.push({ name: '小四喜',  han: 13 });
  return result.length > 0 ? result : null;
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
  const decomps = chiitoi ? [] : decompAll([...counts]); // 面子分解 (七対子時は不要)
  const yaku: YakuResult[] = [];

  // 役満チェック (成立すれば通常役を無視して返す)
  const yakuman = yakumanList(counts, hand14);
  if (yakuman) return yakuman;

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
    // 対々和 (4刻子+1雀頭)
    if (isToitoi(hand14)) yaku.push({ name: '対々和', han: 2 });
    // 二盃口 (AABB形, 3翻) / 一盃口 (同じ順子2組, 1翻) ─ 排他
    if (isRyanpeikou(decomps)) {
      yaku.push({ name: '二盃口', han: 3 });
    } else if (isIipeikou(decomps)) {
      yaku.push({ name: '一盃口', han: 1 });
    }
    // 平和 (全順子+非役牌雀頭, 1翻)
    if (isPinfu(decomps, winner)) yaku.push({ name: '平和', han: 1 });
  }

  // タンヤオ
  if (isTanyao(hand14)) yaku.push({ name: 'タンヤオ', han: 1 });

  // 小三元 (三元牌2刻子+1雀頭, 2翻)
  if (isShousangen(counts)) yaku.push({ name: '小三元', han: 2 });

  // 混老頭 (全牌が么九牌, 2翻)
  if (isHonroutou(hand14)) yaku.push({ name: '混老頭', han: 2 });

  // 純全帯么九 (全面子・雀頭に端牌のみ, 3翻) ─ 混老頭と複合しない
  else if (isJunchan(decomps)) yaku.push({ name: '純全帯么九', han: 3 });

  // 全帯么九 (全面子・雀頭に么九牌, 2翻) ─ 純全帯么九・混老頭と複合しない
  else if (isChanta(decomps)) yaku.push({ name: '全帯么九', han: 2 });

  // 三色同刻 (萬・筒・索で同じ数の刻子, 2翻)
  if (isSanshokudoukou(counts)) yaku.push({ name: '三色同刻', han: 2 });

  // 三色同順 (萬・筒・索で同じ数始まりの順子, 2翻)
  if (isSanshokudoujun(decomps)) yaku.push({ name: '三色同順', han: 2 });

  // 一気通貫 (同色1-9の3順子, 2翻)
  if (isIttsu(counts)) yaku.push({ name: '一気通貫', han: 2 });

  // 三暗刻 (暗刻3つ以上, 2翻)
  if (isSanAnkou(counts)) yaku.push({ name: '三暗刻', han: 2 });

  // 混一色 (数牌1種+字牌, 3翻) / 清一色 (数牌1種のみ, 6翻)
  if (isChinitsu(hand14)) {
    yaku.push({ name: '清一色', han: 6 });
  } else if (isHonitsu(hand14)) {
    yaku.push({ name: '混一色', han: 3 });
  }

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
