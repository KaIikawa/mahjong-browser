/**
 * WebSocket クライアントサービス
 *
 * サーバーとの通信を一元管理する。
 * 接続・再接続・メッセージ送受信を担当し、
 * 受信した GameState は onStateUpdate コールバックで通知する。
 */
import type { C2SMessage, S2CMessage, GameState, Position } from '@mahjong/shared';

export type OnStateUpdate = (state: GameState) => void;
export type OnJoined = (position: Position, roomId: string) => void;
export type OnWaiting = (playerCount: number) => void;
export type OnError = (message: string) => void;

export interface WsCallbacks {
  onStateUpdate: OnStateUpdate;
  onJoined: OnJoined;
  onWaiting: OnWaiting;
  onError: OnError;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private callbacks: WsCallbacks;
  private url: string;

  constructor(url: string, callbacks: WsCallbacks) {
    this.url = url;
    this.callbacks = callbacks;
  }

  connect(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.url);

    this.ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string) as S2CMessage;
        this.handleMessage(msg);
      } catch {
        // 不正な JSON は無視
      }
    };

    this.ws.onerror = () => {
      this.callbacks.onError('サーバーへの接続に失敗しました');
    };

    this.ws.onclose = () => {
      this.callbacks.onError('サーバーから切断されました');
    };
  }

  send(msg: C2SMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private handleMessage(msg: S2CMessage): void {
    switch (msg.type) {
      case 'joined':
        this.callbacks.onJoined(msg.position, msg.roomId);
        break;
      case 'waiting':
        this.callbacks.onWaiting(msg.playerCount);
        break;
      case 'update':
        this.callbacks.onStateUpdate(msg.state);
        break;
      case 'error':
        this.callbacks.onError(msg.message);
        break;
    }
  }
}
