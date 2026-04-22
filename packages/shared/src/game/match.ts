/**
 * 半荘進行ロジック
 *
 * applyRoundResult(match, agariInfo, parentIsTenpai) → MatchState
 *
 * ルール:
 *   - 和了: 獲得点数を winner に加算、放銃/ツモ払いで他家から減算
 *   - 流局: 点数変動なし、本場+1
 *   - 親が和了 → 連荘 (round 変わらず、honba+1)
 *   - 親がテンパイ流局 → 連荘 (round 変わらず、honba+1)
 *   - 親がノーテン流局 → 次の局 (round+1、honba=0)
 *   - 子が和了 → 次の局 (round+1、honba=0)
 *   - round が 8 以上 → 半荘終了
 *   - 持ち点が 0 以下になったプレイヤーがいる → 半荘終了 (飛び)
 */

import type { MatchState, AgariInfo, Position } from '../types';
import { TURN_ORDER } from '../types';

// 東場での親座席マップ (round 0-3: player/simo/toimen/kami)
// 南場は round 4-7 でも同じ順
const PARENT_BY_ROUND: Position[] = ['player', 'simo', 'toimen', 'kami', 'player', 'simo', 'toimen', 'kami'];

export function getParent(round: number): Position {
  return PARENT_BY_ROUND[round % 8];
}

// ─── 局結果を適用して次の MatchState を返す ─────────────
// agariInfo === null の場合は流局
// parentIsTenpai: 流局時の親テンパイ有無 (和了時は無視)
export function applyRoundResult(
  match: MatchState,
  agariInfo: AgariInfo | null,
  parentIsTenpai = false,
): MatchState {
  const newScores = { ...match.scores };

  if (agariInfo !== null) {
    const { winner, score, isTsumo } = agariInfo;

    if (isTsumo) {
      // ツモ: winner が score 獲得、他3人で均等負担
      // scoreDetail の実装で per-player は保持されていないため score を再分割
      // 簡易: 3人で均等 (score / 3 を各自負担)
      const each = Math.round(score / 3 / 100) * 100;
      TURN_ORDER.forEach(p => {
        if (p !== winner) newScores[p] -= each;
      });
      // winner は3人分受け取り (端数補正)
      newScores[winner] += score;
    } else {
      // ロン: (このゲームではツモのみなので念のため)
      newScores[winner] += score;
    }
  }
  // 流局は点数変動なし

  // 次の局判定
  const parent = getParent(match.round);
  const isRenjan =
    (agariInfo !== null && agariInfo.winner === parent) || // 親が和了
    (agariInfo === null && parentIsTenpai);                // 親テンパイ流局
  const newHonba  = isRenjan ? match.honba + 1 : 0;
  const newRound  = isRenjan ? match.round : match.round + 1;

  // 半荘終了判定: 8局超過 or 誰かが飛び (点数 ≤ 0)
  const finished = newRound >= 8 || Object.values(newScores).some(s => s <= 0);

  return {
    round: newRound,
    honba: newHonba,
    scores: newScores,
    finished,
  };
}

// ─── 最終順位を計算して返す ──────────────────────────────
export interface RankEntry {
  pos: Position;
  score: number;
  rank: number;  // 1〜4
}

export function calcRanking(scores: Record<Position, number>): RankEntry[] {
  const entries: RankEntry[] = TURN_ORDER.map(pos => ({ pos, score: scores[pos], rank: 0 }));
  entries.sort((a, b) => b.score - a.score);
  entries.forEach((e, i) => { e.rank = i + 1; });
  // 元の TURN_ORDER 順に戻す
  return TURN_ORDER.map(pos => entries.find(e => e.pos === pos)!);
}
