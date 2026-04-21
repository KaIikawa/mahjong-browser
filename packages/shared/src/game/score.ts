/**
 * 点数計算モジュール
 *
 * calcScore(yakuList, hand14, isTsumo, isParent) → ScoreResult
 *
 * 符計算 (簡略版):
 *   - 七対子: 25符固定
 *   - ツモ: 30符 (20符基本 + ツモ符2 → 切り上げ30)
 *   - ロン: 30符
 *
 * 点数:
 *   基本点 = 符 × 2^(翻+2)
 *   親ロン = ceil_100(基本点 × 6)
 *   親ツモ = ceil_100(基本点 × 2) × 3 人
 *   子ロン = ceil_100(基本点 × 4)
 *   子ツモ = ceil_100(基本点 × 4) (親から) + ceil_100(基本点 × 2) × 2 (子から)
 *
 * 満貫以上は固定点数:
 *   5翻 = 満貫 (子8000, 親12000)
 *   6-7翻 = 跳満
 *   8-10翻 = 倍満
 *   11-12翻 = 三倍満
 *   13翻以上 = 数え役満
 */

import type { YakuResult } from '../types';
import { isChiitoi } from './yaku';
import type { Tile } from '../types';

export interface ScoreResult {
  han: number;
  fu: number;
  score: number;       // 受け取り合計点
  scoreDetail: string; // 表示用 "各XXXpt" or "XXXpt"
}

// 100点単位切り上げ
function ceil100(n: number): number {
  return Math.ceil(n / 100) * 100;
}

// 符計算 (簡略版)
function calcFu(hand14: Tile[], isTsumo: boolean): number {
  if (isChiitoi(hand14)) return 25;
  return 30; // ツモ・ロンとも30符基本
}

// 満貫以上の固定点 (子の受け取り点)
function manganScore(han: number): number {
  if (han >= 13) return 32000; // 数え役満
  if (han >= 11) return 24000; // 三倍満
  if (han >= 8)  return 16000; // 倍満
  if (han >= 6)  return 12000; // 跳満
  return 8000;                 // 満貫 (han=5)
}

// 親の満貫以上 (受け取り点)
function manganScoreParent(han: number): number {
  if (han >= 13) return 48000;
  if (han >= 11) return 36000;
  if (han >= 8)  return 24000;
  if (han >= 6)  return 18000;
  return 12000;
}

export function calcScore(
  yakuList: YakuResult[],
  hand14: Tile[],
  isTsumo: boolean,
  isParent: boolean, // 親かどうか
): ScoreResult {
  const han = yakuList.reduce((s, y) => s + y.han, 0);
  const fu  = calcFu(hand14, isTsumo);

  if (han === 0) {
    return { han, fu, score: 0, scoreDetail: '役なし' };
  }

  const bp = fu * Math.pow(2, han + 2); // 基本点

  if (isParent) {
    // ─── 親 ──────────────────────────────────────────
    if (isTsumo) {
      // 親ツモ: 各子から ceil_100(bp × 2)
      if (han >= 5) {
        const eachPay = manganScoreParent(han) / 3;
        const each    = ceil100(eachPay);
        const total   = each * 3;
        return { han, fu, score: total, scoreDetail: `各${each}pt` };
      }
      const each  = ceil100(bp * 2);
      const total = each * 3;
      return { han, fu, score: total, scoreDetail: `各${each}pt` };
    } else {
      // 親ロン: 放銃者から ceil_100(bp × 6)
      if (han >= 5) {
        const score = manganScoreParent(han);
        return { han, fu, score, scoreDetail: `${score}pt` };
      }
      const score = ceil100(bp * 6);
      return { han, fu, score, scoreDetail: `${score}pt` };
    }
  } else {
    // ─── 子 ──────────────────────────────────────────
    if (isTsumo) {
      // 子ツモ: 親から ceil_100(bp × 4), 他子2人から ceil_100(bp × 2)
      if (han >= 5) {
        const ms     = manganScore(han);
        const parent = ms / 2;     // 親から
        const child  = ms / 4;     // 子から
        const total  = ceil100(parent) + ceil100(child) * 2;
        return { han, fu, score: total, scoreDetail: `各${ceil100(child)}pt (親${ceil100(parent)}pt)` };
      }
      const parentPay = ceil100(bp * 4);
      const childPay  = ceil100(bp * 2);
      const total     = parentPay + childPay * 2;
      return { han, fu, score: total, scoreDetail: `各${childPay}pt (親${parentPay}pt)` };
    } else {
      // 子ロン: 放銃者から ceil_100(bp × 4)
      if (han >= 5) {
        const score = manganScore(han);
        return { han, fu, score, scoreDetail: `${score}pt` };
      }
      const score = ceil100(bp * 4);
      return { han, fu, score, scoreDetail: `${score}pt` };
    }
  }
}
