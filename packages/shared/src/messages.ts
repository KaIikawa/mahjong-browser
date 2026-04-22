import type { GameState, Position } from './types';

// ─── Client → Server ────────────────────────────────────────
// プレイヤーからサーバーへ送るメッセージ
export type C2SMessage =
  | { type: 'join';      roomId: string; playerName: string }
  | { type: 'discard';   index: number }   // -1=ツモ切り, 0-12=手牌から
  | { type: 'tsumo' }                       // ツモ和了宣言
  | { type: 'riichi' }                      // リーチ宣言 (ツモ切りリーチ)
  | { type: 'ron' }                         // ロン和了宣言
  | { type: 'cancelRon' }                   // ロンをキャンセル (見逃し)
  | { type: 'nextRound' }                   // 次の局へ
  | { type: 'restart' };                    // 半荘終了後のリスタート

// ─── Server → Client ────────────────────────────────────────
// サーバーからプレイヤーへ送るメッセージ
export type S2CMessage =
  | { type: 'joined';   position: Position; roomId: string }
  | { type: 'waiting';  playerCount: number }
  | { type: 'update';   state: GameState }
  | { type: 'error';    message: string };
