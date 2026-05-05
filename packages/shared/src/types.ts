// ─── 牌の種類 ───────────────────────────────────────
export type TileKind = 'manzu' | 'pinzu' | 'sozu' | 'tupai';

// 字牌キー: e=東 s=南 w=西 n=北 h=白 no=発 c=中
export type HonorKey = 'e' | 's' | 'w' | 'n' | 'h' | 'no' | 'c';

// ─── プレイヤー座席 ───────────────────────────────────
// player=自分(下) kami=上家(左) toimen=対面(上) simo=下家(右)
export type Position = 'player' | 'kami' | 'toimen' | 'simo';

// ─── 牌 ──────────────────────────────────────────────
export interface Tile {
  kind: TileKind;
  number?: number;   // 1-9 (manzu/pinzu/sozu)
  honor?: HonorKey;  // 字牌の種類
  uid: number;       // 0-135 の固有ID
}

// ─── 各プレイヤーの状態 ───────────────────────────────
export interface PlayerState {
  position: Position;
  hand: Tile[];      // 手牌 (通常13枚)
  discards: Tile[];  // 河 (捨て牌一覧)
}

// ─── ゲームフェーズ ───────────────────────────────────
// playerTurn : 自分のツモ番 (牌選択・捨て操作)
// cpuTurn    : CPU のツモ番 (自動処理中)
// agari      : 和了確定
// ryukyoku   : 流局確定 (山が尽きた)
// waitingRon : ロン確認待ち (捨て牌後、ロン可能なプレイヤーの応答を待つ)
export type GamePhase = 'playerTurn' | 'cpuTurn' | 'agari' | 'ryukyoku' | 'waitingRon';

// ─── 役 ──────────────────────────────────────────────
export interface YakuResult {
  name: string;
  han: number;
}

// ─── 和了情報 ────────────────────────────────────────
export interface AgariInfo {
  winner: Position;        // 和了したプレイヤー
  tile: Tile;              // 和了牌
  isTsumo: boolean;        // ツモ和了か
  yakuList: YakuResult[];  // 成立役一覧
  han: number;             // 合計翻数
  fu: number;              // 符
  score: number;           // 獲得点数 (合計)
  scoreDetail: string;     // 表示用: "各XXXpt" or "XXXpt"
}

// ─── 手番順序 ─────────────────────────────────────────
// 東家=player → 南家=simo → 西家=toimen → 北家=kami → 繰り返し
export const TURN_ORDER: Position[] = ['player', 'simo', 'toimen', 'kami'];

// ─── 局ラベル ─────────────────────────────────────────
export const ROUND_LABELS: string[] = [
  '東1局', '東2局', '東3局', '東4局',
  '南1局', '南2局', '南3局', '南4局',
];

// ─── 対局全体の状態 ───────────────────────────────────
// round  : 0=東1局 … 7=南4局
// honba  : 本場数 (連荘カウント)
// scores : 各プレイヤーの持ち点 (初期 25000)
export interface MatchState {
  round: number;                      // 0-7
  honba: number;                      // 0〜
  scores: Record<Position, number>;   // 持ち点
  finished: boolean;                  // 半荘終了フラグ
}

export function initMatchState(): MatchState {
  return {
    round: 0,
    honba: 0,
    scores: { player: 25000, simo: 25000, toimen: 25000, kami: 25000 },
    finished: false,
  };
}

// ─── ロン確認待ちの状態 ───────────────────────────────
export interface WaitingRonState {
  discarder: Position;    // 捨てたプレイヤー
  tile: Tile;             // 捨て牌
  candidates: Position[]; // ロン可能でまだ応答していないプレイヤー
}

// ─── ゲーム全体の状態 ─────────────────────────────────
export interface GameState {
  wall: Tile[];                          // 山 (残り牌)
  players: Record<Position, PlayerState>;
  drawnTile: Tile | null;               // ツモ牌 (現在の手番プレイヤー)
  selectedIndex: number | null;         // 選択中の手牌インデックス (-1=ツモ牌)
  phase: GamePhase;
  currentTurn: Position;                // 現在の手番プレイヤー
  agariInfo: AgariInfo | null;          // 和了情報 (phase === 'agari' 時のみ非null)
  doraTile: Tile;                       // ドラ表示牌 (公開)
  riichi: Record<Position, boolean>;   // リーチ状態
  riichiTileUid: Record<Position, number | null>; // リーチ宣言牌のuid (null=未リーチ)
  match: MatchState;                    // 対局状態
  playerNames: Record<Position, string>; // プレイヤー名
  waitingRon: WaitingRonState | null;  // ロン確認待ち (phase === 'waitingRon' 時のみ非null)
}
